import { fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { mocked } from 'ts-jest/utils';

import { API } from '../../../../../../api';
import { ErrorKind, OptOutItem } from '../../../../../../types';
import alertDispatcher from '../../../../../../utils/alertDispatcher';
import RepositoriesSection from './index';

jest.mock('../../../../../../api');
jest.mock('../../../../../../utils/alertDispatcher');

const scrollIntoViewMock = jest.fn();

window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

const getMockOptOut = (fixtureId: string): OptOutItem[] => {
  return require(`./__fixtures__/index/${fixtureId}.json`) as OptOutItem[];
};

const mockOnAuthError = jest.fn();

const defaultProps = {
  onAuthError: mockOnAuthError,
};

describe('RepositoriesSection', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it('renders correctly', async () => {
    const mockOptOut = getMockOptOut('1');
    mocked(API).getOptOutList.mockResolvedValue(mockOptOut);

    const result = render(
      <Router>
        <RepositoriesSection {...defaultProps} />
      </Router>
    );

    await waitFor(() => {
      expect(result.asFragment()).toMatchSnapshot();
    });
  });

  describe('Render', () => {
    it('renders component', async () => {
      const mockOptOut = getMockOptOut('2');
      mocked(API).getOptOutList.mockResolvedValue(mockOptOut);

      const { getByText } = render(
        <Router>
          <RepositoriesSection {...defaultProps} />
        </Router>
      );

      await waitFor(() => {
        expect(API.getOptOutList).toHaveBeenCalledTimes(1);
      });

      expect(getByText('Opt-out')).toBeInTheDocument();
      expect(getByText('Kind')).toBeInTheDocument();
      expect(getByText('Repository')).toBeInTheDocument();
      expect(getByText('Publisher')).toBeInTheDocument();
      expect(getByText('Tracking errors')).toBeInTheDocument();
    });

    it('opens Add opt out modal', async () => {
      const mockOptOut = getMockOptOut('2');
      mocked(API).getOptOutList.mockResolvedValue(mockOptOut);

      const { getByTestId, getByRole } = render(
        <Router>
          <RepositoriesSection {...defaultProps} />
        </Router>
      );

      await waitFor(() => {
        expect(API.getOptOutList).toHaveBeenCalledTimes(1);
      });

      const btn = getByTestId('addOptOut');
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);

      await waitFor(() => {
        const modal = getByRole('dialog');
        expect(modal).toBeInTheDocument();
        expect(modal).toHaveClass('active');
      });
    });
  });

  describe('Opt out list', () => {
    it('renders 3 items', async () => {
      const mockOptOut = getMockOptOut('3');
      mocked(API).getOptOutList.mockResolvedValue(mockOptOut);

      const { getAllByTestId } = render(
        <Router>
          <RepositoriesSection {...defaultProps} />
        </Router>
      );

      await waitFor(() => {
        expect(getAllByTestId('optOutRow')).toHaveLength(3);
        expect(getAllByTestId('userLink')).toHaveLength(2);
        expect(getAllByTestId('orgLink')).toHaveLength(1);
        expect(getAllByTestId('repoLink')).toHaveLength(3);
      });

      await waitFor(() => {});
    });

    it('does not display list when no packages', async () => {
      const mockOptOut = getMockOptOut('4');
      mocked(API).getOptOutList.mockResolvedValue(mockOptOut);

      const { queryByTestId } = render(
        <Router>
          <RepositoriesSection {...defaultProps} />
        </Router>
      );

      await waitFor(() => {
        expect(API.getOptOutList).toHaveBeenCalledTimes(1);
      });

      expect(queryByTestId('repositoriesList')).toBeNull();

      await waitFor(() => {});
    });

    it('calls alertDispatcher when getOptOutList call fails with not Unauthorized error', async () => {
      mocked(API).getOptOutList.mockRejectedValue({ kind: ErrorKind.Other });

      render(
        <Router>
          <RepositoriesSection {...defaultProps} />
        </Router>
      );

      await waitFor(() => {
        expect(alertDispatcher.postAlert).toHaveBeenCalledTimes(1);
        expect(alertDispatcher.postAlert).toHaveBeenCalledWith({
          type: 'danger',
          message: 'An error occurred getting your opt-out entries list, please try again later.',
        });
      });

      await waitFor(() => {});
    });

    it('calls history push to load login modal when user is not signed in', async () => {
      mocked(API).getOptOutList.mockRejectedValue({
        kind: ErrorKind.Unauthorized,
      });

      const { getByText } = render(
        <Router>
          <RepositoriesSection {...defaultProps} />
        </Router>
      );

      await waitFor(() => getByText('Repositories'));

      expect(mockOnAuthError).toHaveBeenCalledTimes(1);
      await waitFor(() => {});
    });
  });

  describe('to change opt-out', () => {
    it('to deactivate active opt-out', async () => {
      const mockOptOut = getMockOptOut('5');
      mocked(API).getOptOutList.mockResolvedValue(mockOptOut);
      mocked(API).deleteOptOut.mockResolvedValue('');

      const { getByTestId } = render(
        <Router>
          <RepositoriesSection {...defaultProps} />
        </Router>
      );

      await waitFor(() => {
        expect(API.getOptOutList).toHaveBeenCalledTimes(1);
      });

      const checkbox: HTMLInputElement = getByTestId(
        `${mockOptOut[0].optOutId}_trackingErrors_input`
      ) as HTMLInputElement;
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).toBeChecked();

      const label = getByTestId(`${mockOptOut[0].optOutId}_trackingErrors_label`);
      fireEvent.click(label);

      await waitFor(() => {
        expect(API.deleteOptOut).toHaveBeenCalledTimes(1);
        expect(API.deleteOptOut).toHaveBeenCalledWith(mockOptOut[0].optOutId);
      });

      await waitFor(() => {
        expect(API.getOptOutList).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('when change opt-out entry fails', () => {
    it('generic error', async () => {
      const mockOptOut = getMockOptOut('6');
      mocked(API).getOptOutList.mockResolvedValue(mockOptOut);
      mocked(API).deleteOptOut.mockRejectedValue({ kind: ErrorKind.Other });

      const { getByTestId, queryByTestId } = render(
        <Router>
          <RepositoriesSection {...defaultProps} />
        </Router>
      );

      await waitFor(() => {
        expect(API.getOptOutList).toHaveBeenCalledTimes(1);
      });

      expect(queryByTestId(`${mockOptOut[0].optOutId}_trackingErrors_input`)).toBeInTheDocument();

      const label = getByTestId(`${mockOptOut[0].optOutId}_trackingErrors_label`);
      fireEvent.click(label);

      // Remove it optimistically from document
      await waitFor(() => {
        expect(queryByTestId(`${mockOptOut[0].optOutId}_trackingErrors_input`)).toBeNull();
      });

      expect(API.deleteOptOut).toHaveBeenCalledTimes(1);
      expect(API.deleteOptOut).toHaveBeenCalledWith(mockOptOut[0].optOutId);

      expect(alertDispatcher.postAlert).toHaveBeenCalledTimes(1);
      expect(alertDispatcher.postAlert).toHaveBeenCalledWith({
        type: 'danger',
        message: `An error occurred deleting the opt-out entry for tracking errors notifications for repository ${mockOptOut[0].repository.name}, please try again later.`,
      });

      await waitFor(() => {
        expect(API.getOptOutList).toHaveBeenCalledTimes(2);
      });

      // Add it again if opt-out entry deletion failed
      await waitFor(() => {
        expect(queryByTestId(`${mockOptOut[0].optOutId}_trackingErrors_input`)).toBeInTheDocument();
      });
    });

    it('UnauthorizedError', async () => {
      const mockOptOut = getMockOptOut('6');
      mocked(API).getOptOutList.mockResolvedValue(mockOptOut);
      mocked(API).deleteOptOut.mockRejectedValue({
        kind: ErrorKind.Unauthorized,
      });

      const { getByTestId, queryByTestId } = render(
        <Router>
          <RepositoriesSection {...defaultProps} />
        </Router>
      );

      await waitFor(() => {
        expect(API.getOptOutList).toHaveBeenCalledTimes(1);
      });

      const label = getByTestId(`${mockOptOut[1].optOutId}_trackingErrors_label`);
      fireEvent.click(label);

      await waitFor(() => {
        expect(queryByTestId(`${mockOptOut[1].optOutId}_trackingErrors_input`)).toBeNull();
      });

      await waitFor(() => {
        expect(API.deleteOptOut).toHaveBeenCalledTimes(1);
        expect(API.deleteOptOut).toHaveBeenCalledWith(mockOptOut[1].optOutId);
      });

      await waitFor(() => {
        expect(mockOnAuthError).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('click links', () => {
    it('on user link click', async () => {
      const mockOptOut = getMockOptOut('7');
      mocked(API).getOptOutList.mockResolvedValue(mockOptOut);

      const { queryAllByTestId } = render(
        <Router>
          <RepositoriesSection {...defaultProps} />
        </Router>
      );

      await waitFor(() => {
        expect(API.getOptOutList).toHaveBeenCalledTimes(1);
      });

      const links = queryAllByTestId('userLink');
      expect(links).toHaveLength(2);
      fireEvent.click(links[0]);

      expect(window.location.pathname).toBe('/packages/search');
      expect(window.location.search).toBe('?page=1&user=alias');
    });

    it('on org link click', async () => {
      const mockOptOut = getMockOptOut('8');
      mocked(API).getOptOutList.mockResolvedValue(mockOptOut);

      const { getByTestId } = render(
        <Router>
          <RepositoriesSection {...defaultProps} />
        </Router>
      );

      await waitFor(() => {
        expect(API.getOptOutList).toHaveBeenCalledTimes(1);
      });

      const link = getByTestId('orgLink');
      fireEvent.click(link);

      expect(window.location.pathname).toBe('/packages/search');
      expect(window.location.search).toBe('?page=1&org=artifactHub');
    });

    it('on repo link click', async () => {
      const mockOptOut = getMockOptOut('9');
      mocked(API).getOptOutList.mockResolvedValue(mockOptOut);

      const { queryAllByTestId } = render(
        <Router>
          <RepositoriesSection {...defaultProps} />
        </Router>
      );

      await waitFor(() => {
        expect(API.getOptOutList).toHaveBeenCalledTimes(1);
      });

      const links = queryAllByTestId('repoLink');
      expect(links).toHaveLength(3);
      fireEvent.click(links[0]);

      expect(window.location.pathname).toBe('/packages/search');
      expect(window.location.search).toBe('?page=1&repo=adfinis');
    });
  });
});
