import isUndefined from 'lodash/isUndefined';

import { SearchFiltersURL } from '../types';

export default (query: SearchFiltersURL): string => {
  const p = new URLSearchParams();
  p.set('page', query.pageNumber.toString());
  if (!isUndefined(query.tsQueryWeb)) {
    p.set('ts_query_web', query.tsQueryWeb);
  }
  if (!isUndefined(query.tsQuery) && query.tsQuery.length > 0) {
    p.set('ts_query', query.tsQuery.join(' | '));
  }
  if (query.deprecated) {
    p.set('deprecated', 'true');
  }
  if (query.operators) {
    p.set('operators', 'true');
  }
  if (query.verifiedPublisher) {
    p.set('verified_publisher', 'true');
  }
  if (query.official) {
    p.set('official', 'true');
  }
  Object.keys(query.filters).forEach((filterId: string) => {
    return query.filters[filterId].forEach((id: string) => {
      p.append(filterId, id);
    });
  });
  const result = p.toString();
  return `?${result}`;
};
