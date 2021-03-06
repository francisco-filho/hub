-- search_packages searchs packages in the database that match the criteria in
-- the query provided.
create or replace function search_packages(p_input jsonb)
returns setof json as $$
declare
    v_repository_kinds int[];
    v_users text[];
    v_orgs text[];
    v_repositories text[];
    v_facets boolean := (p_input->>'facets')::boolean;
    v_tsquery_web tsquery := websearch_to_tsquery(p_input->>'ts_query_web');
    v_tsquery tsquery := to_tsquery(p_input->>'ts_query');
begin
    -- Prepare filters for later use
    select array_agg(e::int) into v_repository_kinds
    from jsonb_array_elements_text(p_input->'repository_kinds') e;
    select array_agg(e::text) into v_users
    from jsonb_array_elements_text(p_input->'users') e;
    select array_agg(e::text) into v_orgs
    from jsonb_array_elements_text(p_input->'orgs') e;
    select array_agg(e::text) into v_repositories
    from jsonb_array_elements_text(p_input->'repositories') e;

    return query
    with packages_applying_minimum_filters as (
        select
            p.package_id,
            p.name,
            p.normalized_name,
            p.logo_image_id,
            p.stars,
            p.tsdoc,
            s.display_name,
            s.description,
            s.version,
            s.app_version,
            s.deprecated,
            s.signed,
            s.created_at,
            r.repository_id,
            r.repository_kind_id,
            rk.name as repository_kind_name,
            r.name as repository_name,
            r.url as repository_url,
            r.display_name as repository_display_name,
            r.verified_publisher,
            r.official,
            u.alias as user_alias,
            o.name as organization_name,
            o.display_name as organization_display_name
        from package p
        join snapshot s using (package_id)
        join repository r using (repository_id)
        join repository_kind rk using (repository_kind_id)
        left join "user" u using (user_id)
        left join organization o using (organization_id)
        where s.version = p.latest_version
        and
            case when v_tsquery_web is not null then
                v_tsquery_web @@ p.tsdoc
            else true end
        and
            case when v_tsquery is not null then
                v_tsquery @@ p.tsdoc
            else true end
        and
            case when p_input ? 'verified_publisher' and (p_input->>'verified_publisher')::boolean = true then
                r.verified_publisher = true
            else
                true
            end
        and
            case when p_input ? 'official' and (p_input->>'official')::boolean = true then
                r.official = true
            else
                true
            end
        and
            case when p_input ? 'operators' and (p_input->>'operators')::boolean = true then
                p.is_operator = true
            else
                true
            end
        and
            case when p_input ? 'deprecated' and (p_input->>'deprecated')::boolean = true then
                true
            else
                (s.deprecated is null or s.deprecated = false)
            end
    ), packages_applying_all_filters as (
        select * from packages_applying_minimum_filters
        where
            case when cardinality(v_repository_kinds) > 0
            then repository_kind_id = any(v_repository_kinds) else true end
        and
            case
                when cardinality(v_orgs) > 0 and cardinality(v_users) > 0 then
                    (organization_name = any(v_orgs) or user_alias = any(v_users))
                when cardinality(v_orgs) > 0 then
                    organization_name = any(v_orgs)
                when cardinality(v_users) > 0 then
                    user_alias = any(v_users)
                else true
            end
        and
            case when cardinality(v_repositories) > 0
            then repository_name = any(v_repositories) else true end
    )
    select json_build_object(
        'data', (
            select json_build_object(
                'packages', (
                    select coalesce(json_agg(json_build_object(
                        'package_id', package_id,
                        'name', name,
                        'normalized_name', normalized_name,
                        'logo_image_id', logo_image_id,
                        'stars', stars,
                        'display_name', display_name,
                        'description', description,
                        'version', version,
                        'app_version', app_version,
                        'deprecated', deprecated,
                        'signed', signed,
                        'created_at', floor(extract(epoch from created_at)),
                        'repository', jsonb_build_object(
                            'repository_id', repository_id,
                            'kind', repository_kind_id,
                            'name', repository_name,
                            'display_name', repository_display_name,
                            'url', repository_url,
                            'verified_publisher', verified_publisher,
                            'official', official,
                            'user_alias', user_alias,
                            'organization_name', organization_name,
                            'organization_display_name', organization_display_name
                        )
                    )), '[]')
                    from (
                        select
                            paaf.*,
                            (case when v_tsquery_web is not null then
                                ts_rank(ts_filter(tsdoc, '{a}'), v_tsquery_web, 1) +
                                ts_rank('{0.1, 0.2, 0.2, 1.0}', ts_filter(tsdoc, '{b,c}'), v_tsquery_web)
                            else 1 end) as rank
                        from packages_applying_all_filters paaf
                        order by rank desc, name asc
                        limit (p_input->>'limit')::int
                        offset (p_input->>'offset')::int
                    ) packages_applying_all_filters_paginated
                ),
                'facets', case when v_facets then (
                    select json_build_array(
                        (
                            select json_build_object(
                                'title', 'Organization',
                                'filter_key', 'org',
                                'options', (
                                    select coalesce(json_agg(json_build_object(
                                        'id', organization_name,
                                        'name', coalesce(organization_display_name, organization_name),
                                        'total', total
                                    )), '[]')
                                    from (
                                        select organization_name, organization_display_name, total
                                        from (
                                            select 1 as pri, organization_name, organization_display_name, count(*) as total
                                            from packages_applying_minimum_filters
                                            where organization_name = any(v_orgs)
                                            group by organization_name, organization_display_name
                                            union
                                            select 2 as pri, organization_name, organization_display_name, count(*) as total
                                            from packages_applying_minimum_filters
                                            where organization_name is not null
                                            and
                                                case when cardinality(v_orgs) > 0
                                                then organization_name <> all(v_orgs) else true end
                                            group by organization_name, organization_display_name
                                        ) as orgs
                                        order by pri asc, total desc, organization_name asc
                                    ) as orgs_filtered
                                )
                            )
                        ),
                        (
                            select json_build_object(
                                'title', 'User',
                                'filter_key', 'user',
                                'options', (
                                    select coalesce(json_agg(json_build_object(
                                        'id', user_alias,
                                        'name', user_alias,
                                        'total', total
                                    )), '[]')
                                    from (
                                        select user_alias, total
                                        from (
                                            select 1 as pri, user_alias, count(*) as total
                                            from packages_applying_minimum_filters
                                            where user_alias = any(v_users)
                                            group by user_alias
                                            union
                                            select 2 as pri, user_alias, count(*) as total
                                            from packages_applying_minimum_filters
                                            where user_alias is not null
                                            and
                                                case when cardinality(v_users) > 0
                                                then user_alias <> all(v_users) else true end
                                            group by user_alias
                                        ) as users
                                        order by pri asc, total desc, user_alias asc
                                    ) as users_filtered
                                )
                            )
                        ),
                        (
                            select json_build_object(
                                'title', 'Kind',
                                'filter_key', 'kind',
                                'options', (
                                    select coalesce(json_agg(json_build_object(
                                        'id', repository_kind_id,
                                        'name', repository_kind_name,
                                        'total', total
                                    )), '[]')
                                    from (
                                        select
                                            repository_kind_id,
                                            repository_kind_name,
                                            count(*) as total
                                        from packages_applying_minimum_filters
                                        group by repository_kind_id, repository_kind_name
                                        order by total desc, repository_kind_name asc
                                    ) as breakdown
                                )
                            )
                        ),
                        (
                            select json_build_object(
                                'title', 'Repository',
                                'filter_key', 'repo',
                                'options', (
                                    select coalesce(json_agg(json_build_object(
                                        'id', repository_name,
                                        'name', initcap(repository_name),
                                        'total', total
                                    )), '[]')
                                    from (
                                        select repository_name, total
                                        from (
                                            select 1 as pri, repository_name, count(*) as total
                                            from packages_applying_minimum_filters
                                            where repository_name = any(v_repositories)
                                            group by repository_name
                                            union
                                            select 2 as pri, repository_name, count(*) as total
                                            from packages_applying_minimum_filters
                                            where repository_name is not null
                                            and
                                                case when cardinality(v_repositories) > 0
                                                then repository_name <> all(v_repositories) else true end
                                            group by repository_name
                                        ) as repos
                                        order by pri asc, total desc, repository_name asc
                                    ) as repos_filtered
                                )
                            )
                        )
                    )
                ) else null end
            )
        ),
        'metadata', (
            select json_build_object(
                'limit', (p_input->>'limit')::int,
                'offset', (p_input->>'offset')::int,
                'total', (select count(*) from packages_applying_all_filters)
            )
        )
    );
end
$$ language plpgsql;
