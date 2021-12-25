import { AnchorButton, Callout, HTMLTable, Intent, Menu, MenuDivider, MenuItem, Popover, Position, Spinner } from "@blueprintjs/core";
import Axios from "axios";
import * as classnames from "classnames";
import { makeObservable, observable } from "mobx";
import { observer } from "mobx-react";
import moment from "moment";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import * as React from "react";
import { PageFrame } from "../../../../client/components/pageFrame";
import { NextBasePage } from "../../../../client/helpers/nextBasePage";
import { FLAGLESS_BOT_VIRTUAL_GROUP_NAME } from "../../../../common/consts";
import { CommonPageProps } from "../../../../common/interfaces/commonPageProps";
import { isLocalizedListConfiguration, ListConfiguration, UserNameListColumn } from "../../../../common/modules/lists/listsConfiguration";
import { MODULE_ICONS } from "../../../../common/modules/moduleIcons";
import { MODULE_IDENTIFIERS } from "../../../../common/modules/moduleIdentifiers";
import { AppRunningContext } from "../../../../server/appRunningContext";
import { withCommonServerSideProps } from "../../../../server/helpers/serverSidePageHelpers";
import { GetPortalServerSidePropsResult } from "../../../../server/interfaces/getPortalServerSidePropsResult";
import { ListsModule } from "../../../../server/modules/listsModule/listsModule";
import { moduleManager } from "../../../../server/modules/moduleManager";
import { ListDataResult } from "../../../api/lists/listData";

type CellDataTypes = "date" | "datetime" | "string" | "integer" | "float" | "percentage" | "other";

const DATATYPE_MAP: { [index: string]: CellDataTypes } = {
	"counter": "integer",
	"userName": "string",
	"userGroups": "string",
	"editsInPeriod": "integer",
	"editsInPeriodPercentage": "percentage",
	"editsSinceRegistration": "integer",
	"editsSinceRegistrationPercentage": "percentage",
	"revertedEditsInPeriod": "integer",
	"revertedEditsInPeriodPercentage": "percentage",
	"revertedEditsSinceRegistration": "integer",
	"revertedEditsSinceRegistrationPercentage": "percentage",
	"firstEditDate": "date",
	"lastEditDate": "date",
	"daysBetweenFirstAndLastEdit": "integer",
	"characterChangesInPeriod": "integer",
	"characterChangesInPeriodPercentage": "percentage",
	"characterChangesSinceRegistration": "integer",
	"characterChangesSinceRegistrationPercentage": "percentage",
	"thanksInPeriod": "integer",
	"thanksInPeriodPercentage": "percentage",
	"thanksSinceRegistration": "integer",
	"thanksSinceRegistrationPercentage": "percentage",
	"logEventsInPeriod": "integer",
	"logEventsInPeriodPercentage": "percentage",
	"logEventsSinceRegistration": "integer",
	"logEventsSinceRegistrationPercentage": "percentage",
	"firstLogEventDate": "date",
	"lastLogEventDate": "date",
	"averageLogEventsPerDaySinceRegistration": "float",
	"averageLogEventsPerDayInPeriod": "float",
	"registrationDate": "date",
	"daysSinceRegistration": "integer",
	"daysBetweenFirstAndLastLogEvent": "integer",
	"activeDaysInPeriod": "integer",
	"activeDaysSinceRegistration": "integer",
	"averageEditsPerDaySinceRegistration": "float",
	"averageEditsPerDayInPeriod": "float",
	"levelAtPeriodStart": "integer",
	"levelAtPeriodEnd": "integer",
	"levelAtPeriodEndWithChange": "integer",
	"editsInNamespaceInPeriod": "integer",
	"editsInNamespaceInPeriodPercentage": "percentage",
	"editsInNamespaceSinceRegistration": "integer",
	"editsInNamespaceSinceRegistrationPercentage": "percentage",
	"revertedEditsInNamespaceInPeriod": "integer",
	"revertedEditsInNamespaceInPeriodPercentage": "percentage",
	"revertedEditsInNamespaceSinceRegistration": "integer",
	"revertedEditsInNamespaceSinceRegistrationPercentage": "percentage",
	"characterChangesInNamespaceInPeriod": "integer",
	"characterChangesInNamespaceInPeriodPercentage": "percentage",
	"characterChangesInNamespaceSinceRegistration": "integer",
	"characterChangesInNamespaceSinceRegistrationPercentage": "percentage",
	"activeDaysInNamespaceInPeriod": "integer",
	"activeDaysInNamespaceSinceRegistration": "integer",
	"editsInPeriodByChangeTag": "integer",
	"editsSinceRegistrationByChangeTag": "integer",
	"characterChangesInPeriodByChangeTag": "integer",
	"characterChangesSinceRegistrationByChangeTag": "integer",
	"logEventsInPeriodByType": "integer",
	"logEventsSinceRegistrationByType": "integer"
};


interface ListByIdPageProps extends CommonPageProps {
	wikiFound: boolean;
	wikiId: string | null;
	wikiBaseUrl: string | null;
	listFound: boolean;
	list: ListConfiguration | null;
}

@observer
class ListByIdPage extends NextBasePage<ListByIdPageProps> {
	isLoading: boolean = false;
	failedToLoad: boolean = false;
	data: ListDataResult;

	private intFormatter: Intl.NumberFormat;
	private floatFormatter: Intl.NumberFormat;
	private percentFormatter: Intl.NumberFormat;

	constructor(props: ListByIdPageProps) {
		super(props);

		makeObservable(this, {
			isLoading: observable,
			failedToLoad: observable,
			data: observable,
		});

		this.intFormatter = Intl.NumberFormat(this.props.languageCode, {
			maximumFractionDigits: 0,
			minimumFractionDigits: 0,
		});

		this.floatFormatter = Intl.NumberFormat(this.props.languageCode, {
			maximumFractionDigits: 2,
			minimumFractionDigits: 0,
		});

		this.percentFormatter = Intl.NumberFormat(this.props.languageCode, {
			style: "percent",
			maximumFractionDigits: 2,
			minimumFractionDigits: 0,
		});

		if (this.props.wikiFound && this.props.listFound && this.props.list) {
			this.fetchData();
		}
	}

	private fetchData = async (): Promise<void> => {
		if (!this.props.list)
			return;

		this.isLoading = true;
		this.failedToLoad = false;

		try {
			const resp = await Axios.post(
				"/api/lists/listData",
				{
					wikiId: this.props.wikiId,
					listId: `${this.props.list.groupId}.${this.props.list.id}`,
					startDate: "2021-06-01",
					endDate: "2021-06-30",
					languageCode: this.props.languageCode
				},
				{ timeout: 500000 }
			);

			if (resp.status === 200) {
				this.data = resp.data;
			} else {
				this.failedToLoad = true;
			}
		}
		catch (err) {
			this.failedToLoad = true;
		}

		this.isLoading = false;
	}

	public render(): JSX.Element {
		if (!this.props.wikiFound || !this.props.listFound || !this.props.list) {
			return this.render404Page();
		}

		const listTitle = isLocalizedListConfiguration(this.props.list)
			? this.t(this.props.list.i18nKey)
			: this.props.list.name;

		return <PageFrame
			parents={[
				{ content: this.t("module.lists"), routeLink: "/modules/lists" },
				{ content: this.props.wikiId, routeLink: `/modules/lists/${this.props.wikiId}` }
			]}
			icon={MODULE_ICONS[MODULE_IDENTIFIERS.lists]}
			title={listTitle}
			router={this.props.router}
			i18nProvider={this.i18nProvider}>
			{this.isLoading ? <Spinner /> : this.renderContent()}
		</PageFrame>;
	}

	private renderContent(): JSX.Element {
		if (this.failedToLoad) {
			return <Callout intent={Intent.DANGER}>
				{this.t("lists.failedToLoadList")}
			</Callout>;
		}

		if (this.data.results.length === 0) {
			return <Callout intent={Intent.PRIMARY}>
				{this.t("lists.noUsersOnList")}
			</Callout>;
		}

		return <>
			<HTMLTable className="wikiStatList" bordered striped condensed interactive>
				<thead>
					{this.renderTableColumnHeaders()}
				</thead>
				<tbody>
					{this.renderTableRows()}
				</tbody>
			</HTMLTable>
		</>;
	}

	private renderTableColumnHeaders(): React.ReactNode {
		return this.data.list.columns.map((col, idx) => {
			const headerProps: React.ThHTMLAttributes<HTMLTableHeaderCellElement> = {};

			const dataType: CellDataTypes = Object.prototype.hasOwnProperty.call(DATATYPE_MAP, col.type)
				? DATATYPE_MAP[col.type]
				: "other";

			return <th
				key={idx.toString()}
				className={classnames({
					[`listColumn-type-${col.type}`]: true,
					[`listColumn-dataType-${dataType}`]: true
				})}
				{...headerProps}
			>
				{col.headerI18nKey ? this.t(col.headerI18nKey) : col.type}
			</th>;
		});
	}

	private renderTableRows(): React.ReactNode {
		return this.data.results.map((row) => {
			const classes = {
				"listRow-fadeBot": this.props.list?.displaySettings?.fadeBots
					&& row.actorGroups
					&& (row.actorGroups.indexOf("bot") !== -1 || row.actorGroups.indexOf(FLAGLESS_BOT_VIRTUAL_GROUP_NAME) !== -1)
			};

			return <tr className={classnames(classes)} key={row.id.toString()}>
				{this.renderTableRow(row.id, row.data)}
			</tr>;
		});
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private renderTableRow(actorId: number, data: any[]): React.ReactNode {
		return data.map((data, idx) => {
			const columnDefinition = this.data.list.columns[idx];

			const dataType: CellDataTypes = Object.prototype.hasOwnProperty.call(DATATYPE_MAP, columnDefinition.type)
				? DATATYPE_MAP[columnDefinition.type]
				: "other";

			let cellContent: React.ReactNode = "–";
			if (columnDefinition.type === "counter") {
				cellContent = typeof data === "number" ? `${data}.` : "";
			} else if (columnDefinition.type === "userName") {
				cellContent = this.renderUserName(actorId, data, columnDefinition);
			} else if (columnDefinition.type === "userGroups") {
				cellContent = this.renderUserGroups(data);
			} else if (columnDefinition.type === "levelAtPeriodStart"
				|| columnDefinition.type === "levelAtPeriodEnd") {
				cellContent = this.renderUserLevel(data);
			} else if (columnDefinition.type === "levelAtPeriodEndWithChange") {
				cellContent = this.renderUserLevelWithChange(data);
			} else if (typeof data === "number") {
				if (dataType === "integer") {
					cellContent = this.intFormatter.format(data);
				} else if (dataType === "percentage") {
					cellContent = this.percentFormatter.format(data);
				} else if (dataType === "float") {
					cellContent = this.floatFormatter.format(data);
				} else {
					cellContent = `${columnDefinition.type}, ${dataType}: ${data}`;
				}
			} else if (typeof data === "string") {
				cellContent = data;
			} else if (Array.isArray(data) && data.length === 3) {
				cellContent = moment.utc(data).format("YYYY-MM-DD");
			} else if (data != null) {
				cellContent = `${typeof data}: ${data}`;
			}

			return <td
				key={idx.toString()}
				className={classnames({
					[`listCell-type-${columnDefinition.type}`]: true,
					[`listCell-dataType-${dataType}`]: true
				})}>
				{cellContent}
			</td>;
		});
	}

	private renderUserName(
		actorId: number,
		userName: string,
		columnDefinition: UserNameListColumn
	): React.ReactNode {
		const userLinks: React.ReactNode[] = [];

		if (columnDefinition.userLinks?.talkPage === true) {
			userLinks.push(
				<MenuItem key="talkPage"
					href={ListByIdPage.makeWikiLink(this.props.wikiBaseUrl, `User talk:${userName}`)}
					target="_blank"
					rel="noreferrer"
					icon="chat"
					text={this.t("lists.userLinks.talkPage")}
				/>
			);
		}

		if (columnDefinition.userLinks?.edits === true) {
			userLinks.push(
				<MenuItem key="contributions"
					href={ListByIdPage.makeWikiLink(this.props.wikiBaseUrl, `Special:Contributions/${userName}`)}
					target="_blank"
					rel="noreferrer"
					icon="history"
					text={this.t("lists.userLinks.contributions")}
				/>
			);
		}

		return <>
			<div className="userNameCell-firstRow">
				<b>{userName}</b>
				{userLinks.length > 0 && <Popover
					position={Position.BOTTOM}
					content={<Menu>
						{userLinks}
						<MenuDivider title="Debug info" />
						<MenuItem
							text={`actor id: ${actorId}`}
						/>
					</Menu>}
				>
					<AnchorButton className="userLinks-button" small minimal icon="menu" />
				</Popover>}
			</div>
		</>;
	}

	private renderUserGroups(groups: string[]) {
		if (!groups || Array.isArray(groups) === false)
			return "";

		const groupsLocalized = groups.map(group => this.t(`userGroup.${group}.member`));
		return groupsLocalized.join(", ");
	}

	private renderUserLevel(data: [string, string]) {
		if (!data) {
			return "–";
		}

		return data[1];
	}

	private renderUserLevelWithChange(data: [string, string, boolean]) {
		if (!data) {
			return "–";
		}

		return <>
			{data[2] && "🔺"}
			{data[1]}
		</>;
	}

	private static makeWikiLink(wikiBaseUrl: string | null, subUrl: string): string | undefined {
		return `https://${wikiBaseUrl}/wiki/${subUrl}`;
	}
}

export const getServerSideProps = async (ctx: NextPageContext): Promise<GetPortalServerSidePropsResult<ListByIdPageProps>> => {

	const appCtx = AppRunningContext.getInstance("portal");

	const wiki = appCtx.getKnownWikiById(typeof ctx.query["wiki"] === "string" ? ctx.query["wiki"] : undefined);
	const listsModule = moduleManager.getModuleById<ListsModule>(MODULE_IDENTIFIERS.lists);
	const list = listsModule?.getListByFullId(wiki?.id, typeof ctx.query["fullListId"] === "string" ? ctx.query["fullListId"] : undefined);

	return await withCommonServerSideProps<ListByIdPageProps>(ctx, {
		wikiFound: !!wiki,
		wikiId: wiki?.id ?? null,
		wikiBaseUrl: wiki?.domain ?? null,
		listFound: !!list,
		list: list ?? null,
	});
};

export default withRouter(ListByIdPage);
