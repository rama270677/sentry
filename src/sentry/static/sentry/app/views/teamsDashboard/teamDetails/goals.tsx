import React from 'react';
import {Location} from 'history';
import styled from '@emotion/styled';
import isFinite from 'lodash/isFinite';

import {formatPercentage} from 'app/utils/formatters';
import theme from 'app/utils/theme';
import Placeholder from 'app/components/placeholder';
import {Client} from 'app/api';
import {PanelTable, Panel, PanelItem} from 'app/components/panels';
import DiscoverButton from 'app/components/discoverButton';
import {getInterval} from 'app/components/charts/utils';
import DateTime from 'app/components/dateTime';
import {Goal, Member, Organization, Project, SelectValue} from 'app/types';
import EventsRequest from 'app/components/charts/eventsRequest';
import EventView from 'app/utils/discover/eventView';
import {tokenizeSearch, stringifyQueryObject} from 'app/utils/tokenizeSearch';
import DiscoverQuery from 'app/utils/discover/discoverQuery';
import ProgressRing from 'app/components/progressRing';
import {t} from 'app/locale';
import GlobalModal from 'app/components/globalModal';
import Button from 'app/components/button';
import {openModal} from 'app/actionCreators/modal';
import {getAggregateAlias} from 'app/utils/discover/fields';
import TextField from 'app/views/settings/components/forms/textField';
import SelectControl from 'app/components/forms/selectControl';
import {BufferedInput} from 'app/views/eventsV2/table/queryField';
import withApi from 'app/utils/withApi';

const Sparklines = React.lazy(() =>
  import(/* webpackChunkName: "Sparklines" */ 'app/components/sparklines')
);
const SparklinesLine = React.lazy(() =>
  import(/* webpackChunkName: "SparklinesLine" */ 'app/components/sparklines/line')
);

// Height of sparkline
const SPARKLINE_HEIGHT = 38;

type Props = {
  goals?: Array<Goal>;
  api: Client;
  organization: Organization;
  projects: Project[];
  location: Location;
};

type State = {
  orgMemberList: Array<Member>;
  isDropdownBusy: boolean;
  query: string;
};

const goals: Array<Goal> = [
  {
    id: '1',
    dateCreated: String(new Date()),
    title: 'Q3 Apdex Goal',
    duedate: String(new Date('September 30, 2020 11:59:59')),
    progress: 30,
    owner: {
      // @ts-ignore
      user: {
        id: '1',
        name: 'Jane Bloggs',
        email: 'janebloggs@example.com',
      },
      inviteStatus: 'requested_to_join',
    },
    transactionName: '/api/0/organizations/{organization_slug}/eventsv2/',
    aggregateObjective: 'apdex(300)',
    description: 'Discover query apdex',
    comparisonOperator: '>=',
    valueObjective: 0.9,
  },
  {
    id: '2',
    dateCreated: String(new Date()),
    title: 'Discover Goals',
    duedate: String(new Date()),
    progress: 30,
    owner: {
      // @ts-ignore
      user: {
        id: '1',
        name: 'Jane Bloggs',
        email: 'janebloggs@example.com',
      },
      inviteStatus: 'requested_to_join',
    },
    transactionName: '/api/0/organizations/{organization_slug}/events*',
    aggregateObjective: 'slo(countStatus(ok),count())',
    description: 'Percent of successful discover queries',
    comparisonOperator: '>=',
    valueObjective: 0.95,
  },
];
class Goals extends React.Component<Props, State> {
  renderGoal = (goal: Goal) => {
    const {organization, projects, location} = this.props;

    const orgFeatures = new Set(organization.features);

    const searchConditions = tokenizeSearch('');
    searchConditions.setTag('event.type', ['transaction']);
    searchConditions.setTag('transaction', [goal.transactionName]);

    const range = '30d';

    // if an org has no global-views, we make an assumption that errors are collected in the same
    // project as the current transaction event where spans are collected into
    const projs = orgFeatures.has('global-views') ? [] : projects.map(p => Number(p.id));

    const query = stringifyQueryObject(searchConditions);

    const eventView = EventView.fromSavedQuery({
      id: undefined,
      name: 'Transaction',
      fields: ['transaction', goal.aggregateObjective],
      orderby: '-timestamp',
      query,
      projects: projs,
      version: 2,
      range,
    });

    return (
      <DiscoverQuery
        eventView={eventView}
        orgSlug={organization.slug}
        location={location}
      >
        {({isLoading, tableData}) => {
          if (isLoading || !tableData) {
            return null;
          }

          if (tableData.data.length <= 0) {
            return null;
          }

          const row = tableData.data[0];
          const needle = getAggregateAlias(goal.aggregateObjective);

          let currentValue = Number(row[needle]);
          if (!isFinite(currentValue)) {
            currentValue = 0;
          }

          return (
            <React.Fragment key={goal.id}>
              <div>
                <DiscoverButton
                  to={eventView.getResultsViewUrlTarget(organization.slug)}
                  size="small"
                  data-test-id="discover-open"
                >
                  {goal.title}
                </DiscoverButton>
              </div>
              <div>{goal.transactionName}</div>
              <div>{`${goal.aggregateObjective} ${goal.comparisonOperator} ${goal.valueObjective}`}</div>
              <div>{formatPercentage(currentValue)}</div>
              <div>
                {/*<ProgressRing value={progress * 100} size={40} barWidth={6} />*/}
                <GoalSparkline
                  organization={organization}
                  query={query}
                  range={range}
                  projects={projs}
                  yAxis={goal.aggregateObjective}
                />
              </div>
              <DateTime date={goal.duedate} shortDate />
              <div>{goal.description || '-'}</div>
              <div>{goal.owner.user.name}</div>
            </React.Fragment>
          );
        }}
      </DiscoverQuery>
    );
  };

  setGoalName = _value => {
    // this.setState({
    //   teamDescription: value,
    // });
  };

  setAggregateFunction = _value => {};

  render() {
    const aggregateOptions: Array<SelectValue<string>> = [
      {
        label: 'foo',
        value: 'foo',
      },
      {
        label: 'bar',
        value: 'bar',
      },
    ];

    const comparisonOperatorsOptions: Array<SelectValue<string>> = [
      {
        label: '>',
        value: '>',
      },
      {
        label: '<',
        value: '<',
      },
      {
        label: '>=',
        value: '>=',
      },
      {
        label: '<=',
        value: '<=',
      },
    ];

    return (
      <React.Fragment>
        <HeaderContainer>
          <Button
            onClick={() =>
              openModal(({closeModal, Header, Body}) => (
                <div>
                  <Header>Add Goal</Header>
                  <Body>
                    <Panel>
                      <TextField
                        name="goal-name"
                        label="Set goal name"
                        placeholder="Set goal name"
                        onChange={this.setGoalName}
                        value=""
                      />
                      <TextField
                        name="transaction-name"
                        label="Set transaction name"
                        placeholder="Set transaction name"
                        onChange={this.setGoalName}
                        value=""
                      />
                      <PanelItem>
                        <ObjectiveContainer>
                          <AggregateContainer>
                            <SelectControl
                              key="select"
                              name="aggregate"
                              placeholder={t('Select aggregate')}
                              options={aggregateOptions}
                              value={aggregateOptions[1]}
                              required
                              onChange={this.setAggregateFunction}
                            />
                          </AggregateContainer>
                          <ComparisonOperatorContainer>
                            <SelectControl
                              key="select"
                              name="comparison-operator"
                              placeholder={t('Comparison operator')}
                              options={comparisonOperatorsOptions}
                              value={comparisonOperatorsOptions[0]}
                              required
                              onChange={this.setAggregateFunction}
                            />
                          </ComparisonOperatorContainer>
                          <ObjectiveValueContainer>
                            <BufferedInput
                              name="refinement"
                              key="parameter:number"
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*(\.[0-9]*)?"
                              required
                              value="0.99"
                              onUpdate={() => {
                                return;
                              }}
                            />
                          </ObjectiveValueContainer>
                        </ObjectiveContainer>
                      </PanelItem>
                    </Panel>
                    <Button onClick={closeModal}>Close</Button>
                  </Body>
                </div>
              ))
            }
          >
            Add Goal
          </Button>
        </HeaderContainer>
        <PanelTable
          headers={[
            t('Title'),
            t('Transaction Name'),
            t('Objective'),
            t('Current'),
            t('Progress'),
            t('Due date'),
            t('Description'),
            t('Created By'),
          ]}
          emptyMessage={t('This team has no goals')}
        >
          {goals.map(goal => this.renderGoal(goal))}
        </PanelTable>
        <GlobalModal />
      </React.Fragment>
    );
  }
}

type SparklineProps = {
  organization: Organization;
  api: Client;
  query: string;
  range: string;
  projects: number[];
  yAxis: string;
};

class _GoalSparkline extends React.Component<SparklineProps> {
  render() {
    const {organization, api, query, range, projects, yAxis} = this.props;
    return (
      <EventsRequest
        organization={organization}
        api={api}
        query={query}
        start={undefined}
        end={undefined}
        period={range}
        interval={getInterval({period: range}, true)}
        project={projects}
        environment={[] as string[]}
        includePrevious={false}
        yAxis={yAxis}
      >
        {({loading, timeseriesData, errored}) => {
          if (loading || errored) {
            return null;
          }

          const data = (timeseriesData?.[0]?.data ?? []).map(d => d.value);

          return (
            <React.Suspense fallback={<SparkLinePlaceholder />}>
              <div data-test-id="incident-sparkline">
                <Sparklines data={data} width={100} height={32}>
                  <SparklinesLine
                    style={{
                      stroke: theme.gray500,
                      fill: 'none',
                      strokeWidth: 2,
                    }}
                  />
                </Sparklines>
              </div>
            </React.Suspense>
          );
        }}
      </EventsRequest>
    );
  }
}

const GoalSparkline = withApi(_GoalSparkline);

const HeaderContainer = styled('div')`
  margin-bottom: 8px;
`;

const ObjectiveContainer = styled('div')`
  width: 100%;
  display: flex;

  > * + * {
    margin-left: 8px;
  }
`;

const AggregateContainer = styled('div')`
  flex-grow: 1;
`;

const ComparisonOperatorContainer = styled('div')`
  min-width: 100px;
`;

const ObjectiveValueContainer = styled('div')`
  min-width: 150px;
`;

const SparkLinePlaceholder = styled(Placeholder)`
  height: ${SPARKLINE_HEIGHT}px;
`;

export default Goals;