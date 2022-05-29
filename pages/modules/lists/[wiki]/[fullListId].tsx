import { AnchorButton, Button, Callout, Classes, Dialog, HTMLTable, Intent, Menu, MenuDivider, MenuItem, Popover, Position, Spinner, TextArea } from "@blueprintjs/core";
import Axios from "axios";
import * as classnames from "classnames";
import { action, makeObservable, observable } from "mobx";
import { observer } from "mobx-react";
import moment from "moment";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import * as React from "react";
import { MonthYearIntervalSelector } from "../../../../client/components/monthYearIntervalSelector";
import { PageFrame } from "../../../../client/components/pageFrame";
import { ParameterBox } from "../../../../client/components/parameterBox";
import { ParameterGroup } from "../../../../client/components/parameterGroup";
import { generateCsvFromListData, generateWikitextFromListData } from "../../../../client/helpers/exportList";
import { CellDataTypes, LIST_COLUMN_DATATYPE_MAP } from "../../../../client/helpers/listColumnDataTypes";
import { NextBasePage } from "../../../../client/helpers/nextBasePage";
import { FLAGLESS_BOT_VIRTUAL_GROUP_NAME } from "../../../../common/consts";
import { CommonPageProps } from "../../../../common/interfaces/commonPageProps";
import { GroupActor } from "../../../../common/interfaces/statisticsQueryModels";
import { isLocalizedListConfiguration, ListColumn, ListConfiguration, UserNameListColumn } from "../../../../common/modules/lists/listsConfiguration";
import { MODULE_ICONS } from "../../../../common/modules/moduleIcons";
import { MODULE_IDENTIFIERS } from "../../../../common/modules/moduleIdentifiers";
import { AppRunningContext } from "../../../../server/appRunningContext";
import { withCommonServerSideProps } from "../../../../server/helpers/serverSidePageHelpers";
import { GetPortalServerSidePropsResult } from "../../../../server/interfaces/getPortalServerSidePropsResult";
import { ListsModule } from "../../../../server/modules/listsModule/listsModule";
import { moduleManager } from "../../../../server/modules/moduleManager";
import { ListDataActorEntry, ListDataGroupEntry, ListDataResult } from "../../../api/lists/listData";
import styles from "./[fullListId].module.scss";

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
	listData: ListDataResult | null;
	isWikiTextDialogOpen: boolean = false;
	wikiTextContent: string = "";

	fromDate: Date;
	toDate: Date;

	private intFormatter: Intl.NumberFormat;
	private floatFormatter: Intl.NumberFormat;
	private percentFormatter: Intl.NumberFormat;

	constructor(props: ListByIdPageProps) {
		super(props);

		this.fromDate = moment().startOf("year").toDate();
		this.toDate = moment().startOf("day").toDate();

		makeObservable(this, {
			isLoading: observable,
			failedToLoad: observable,
			listData: observable,
			isWikiTextDialogOpen: observable,
			wikiTextContent: observable,
			fromDate: observable,
			toDate: observable,

			// fetchData: action,
			onExportToWikitextButtonClick: action,
			onFromDateChange: action,
			onToDateChange: action,
			onLoadButtonClick: action
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

	async fetchData(): Promise<void> {
		if (!this.props.list)
			return;

		this.isLoading = true;
		this.listData = null;
		this.failedToLoad = false;

		let startDate: moment.Moment = moment();
		let endDate: moment.Moment = moment();

		if (this.props.list.dateMode === "userSelectable") {
			startDate = moment(this.fromDate);
			endDate = moment(this.toDate);

			if (endDate.isBefore(startDate)) {
				return;
			}
		} else {
			startDate = moment().subtract(1, "month");
		}

		try {
			const resp = await Axios.post(
				"/api/lists/listData",
				{
					wikiId: this.props.wikiId,
					listId: `${this.props.list.groupId}.${this.props.list.id}`,
					startDate: startDate.format("YYYY-MM-DD"),
					endDate: endDate.format("YYYY-MM-DD"),
					languageCode: this.props.languageCode
				},
				{ timeout: 500000 }
			);

			if (resp.status === 200) {
				this.listData = resp.data;
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
			i18nProvider={this.i18nProvider}
			titleActions={this.renderTitleActions()}>
			{this.renderListDescription()}
			{this.renderControls()}
			{this.isLoading ? <Spinner /> : this.renderContent()}
		</PageFrame>;
	}

	private renderTitleActions() {
		return <Popover minimal
			placement="top-end"
			content={this.renderExportMenu()}
			disabled={this.isLoading === true}
		>
			<Button outlined
				text={this.t("lists.export")}
				rightIcon="caret-down"
				disabled={this.isLoading === true} />
		</Popover>;
	}

	private renderExportMenu() {
		return <Menu>
			<MenuItem icon="widget-button" text={this.t("lists.export.csv")} onClick={this.onExportToCsvButtonClick} />
			<MenuItem icon="th" text={this.t("lists.export.wikitext")} onClick={this.onExportToWikitextButtonClick} />
		</Menu>;
	}

	private onExportToCsvButtonClick = async () => {
		if (!this.listData)
			return;

		const columns = this.getDisplayedColumnList();
		const content = generateCsvFromListData(this.listData, columns, this.t);
		const contentBlob = new Blob([content], {
			type: "text/csv;charset=utf-8"
		});

		const { saveAs } = await import("save-as");
		saveAs(contentBlob, `statisticsExport-${moment().format("yyyy-MM-dd-HH-mm-ss.csv")}.csv`);
	}

	onExportToWikitextButtonClick = () => {
		if (!this.listData)
			return;

		const columns = this.getDisplayedColumnList();
		this.wikiTextContent = generateWikitextFromListData(this.listData, columns, this.t, this.props.languageCode);
		this.isWikiTextDialogOpen = true;
	}

	private renderListDescription() {
		if (!this.props.list)
			return null;

		let listDescription: string | null = null;
		if (isLocalizedListConfiguration(this.props.list)) {
			const descriptionI18nKey = `${this.props.list.i18nKey}.description`;
			if (this.hasLocalization(descriptionI18nKey)) {
				listDescription = this.t(descriptionI18nKey);
			}
		} else if (this.props.list.description != null) {
			listDescription = this.props.list.description;
		}

		if (!listDescription)
			return null;

		return <Callout
			icon="info-sign"
			className={styles.listDescription}>
			{listDescription}
		</Callout>;
	}

	private renderControls(): JSX.Element | null {
		if (this.props.list?.dateMode !== "userSelectable")
			return null;

		return <ParameterBox>
			<ParameterGroup>
				<MonthYearIntervalSelector
					translate={this.t}
					disabled={this.isLoading}
					localizationProvider={this.getDateInputLocalizationProvider()}
					fromDate={this.fromDate}
					onFromDateChange={this.onFromDateChange}
					toDate={this.toDate}
					onToDateChange={this.onToDateChange}
				/>
				<Button outlined
					text={this.t("lists.load")}
					onClick={this.onLoadButtonClick}
					disabled={this.isLoading === true} />
			</ParameterGroup>
		</ParameterBox>;
	}

	onLoadButtonClick = () => {
		this.fetchData();
	}

	onFromDateChange = (date: Date) => {
		this.fromDate = date;
	}

	onToDateChange = (date: Date) => {
		this.toDate = date;
	}

	private renderContent(): JSX.Element {
		if (this.failedToLoad) {
			return <Callout intent={Intent.DANGER}>
				{this.t("lists.failedToLoadList")}
			</Callout>;
		}

		if (!this.listData || this.listData.results.length === 0) {
			return <Callout intent={Intent.PRIMARY}>
				{this.t("lists.noUsersOnList")}
			</Callout>;
		}

		return <>
			<HTMLTable className="wikiStatList" bordered striped condensed interactive>
				<thead>
					<tr>
						{this.renderTableColumnHeaders()}
					</tr>
				</thead>
				<tbody>
					{this.renderTableRows()}
				</tbody>
			</HTMLTable>
			<Dialog
				className={styles.exportDialog}
				title="Wikitext export"
				icon="cloud-download"
				isOpen={this.isWikiTextDialogOpen}
				isCloseButtonShown={true}
				onClose={() => this.isWikiTextDialogOpen = false}
			>
				<div className={Classes.DIALOG_BODY}>
					<TextArea
						className={styles.exportDialogTextArea}
						value={this.wikiTextContent}
					/>
				</div>
			</Dialog>
		</>;
	}

	private renderTableColumnHeaders(): React.ReactNode {
		if (!this.listData)
			return null;

		const columnList = this.getDisplayedColumnList();
		return columnList.map(this.renderSingleTableColumnHeader);
	}

	private renderSingleTableColumnHeader = (col, idx) => {
		if (col.isHidden)
			return null;

		const headerProps: React.ThHTMLAttributes<HTMLTableHeaderCellElement> = {};

		const dataType: CellDataTypes | undefined = Object.prototype.hasOwnProperty.call(LIST_COLUMN_DATATYPE_MAP, col.type)
			? LIST_COLUMN_DATATYPE_MAP[col.type]
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
	};

	private renderTableRows(): React.ReactNode {
		if (!this.listData)
			return null;

		const isGrouped = this.listData?.list.groupBy && this.listData.list.groupBy.length > 0;
		const columns = this.getDisplayedColumnList();

		return this.listData.results.map((row: ListDataActorEntry | ListDataGroupEntry, idx: number) => {
			if (isGrouped) {
				const groupRow = row as ListDataGroupEntry;

				return <tr key={idx.toString()}>
					{this.renderGroupTableRow(columns, groupRow.data, groupRow.users)}
				</tr>;
			} else {
				const actorRow = row as ListDataActorEntry;

				const classes = {
					"listRow-fadeUser": this.shouldFadeUser(actorRow)
				};

				return <tr className={classnames(classes)} key={actorRow.actorId.toString()}>
					{this.renderActorTableRow(actorRow.actorId, actorRow.columnData)}
				</tr>;
			}
		});
	}
	private shouldFadeUser(row: ListDataActorEntry): boolean {
		if (this.props.list?.displaySettings?.fadeBots
			&& row.groups
			&& (row.groups.indexOf("bot") !== -1 || row.groups.indexOf(FLAGLESS_BOT_VIRTUAL_GROUP_NAME) !== -1))
			return true;

		if (this.props.list?.displaySettings?.fadeNonSysops
			&& (!row.groups || row.groups.indexOf("sysop") === -1))
			return true;

		return false;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private renderActorTableRow(actorId: number, rowData: any[]): React.ReactNode {
		if (!this.listData)
			return;

		const listData = this.listData;

		return rowData.map((rowCellData, idx) => {
			return this.renderRowCellData(listData.list.columns, rowCellData, idx, actorId);
		});
	}

	private renderGroupTableRow(groupColumns: ListColumn[], rowData: any[], users: GroupActor[]): React.ReactNode {
		return [...rowData, users].map((rowCellData, idx) => {
			return this.renderRowCellData(groupColumns, rowCellData, idx);
		});
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private renderRowCellData = (columns: ListColumn[], rowCellData: any, idx: number, actorId: number = -1) => {
		const columnDefinition = columns[idx];
		if (columnDefinition.isHidden)
			return null;

		const dataType: CellDataTypes | undefined = Object.prototype.hasOwnProperty.call(LIST_COLUMN_DATATYPE_MAP, columnDefinition.type)
			? LIST_COLUMN_DATATYPE_MAP[columnDefinition.type]
			: "other";

		let cellContent: React.ReactNode = "–";
		if (columnDefinition.type === "counter") {
			cellContent = typeof rowCellData === "number" ? `${rowCellData}.` : "";
		} else if (columnDefinition.type === "userName") {
			cellContent = this.renderUserName(actorId, rowCellData, columnDefinition);
		} else if (columnDefinition.type === "userNames") {
			cellContent = this.renderUserNameList(rowCellData);
		} else if (columnDefinition.type === "userGroups") {
			cellContent = this.renderUserGroups(rowCellData);
		} else if (columnDefinition.type === "levelAtPeriodStart"
			|| columnDefinition.type === "levelAtPeriodEnd") {
			cellContent = this.renderUserLevel(rowCellData);
		} else if (columnDefinition.type === "levelAtPeriodEndWithChange") {
			cellContent = this.renderUserLevelWithChange(rowCellData);
		} else if (typeof rowCellData === "number") {
			if (dataType === "integer") {
				cellContent = this.intFormatter.format(rowCellData);
			} else if (dataType === "percentage") {
				cellContent = this.percentFormatter.format(rowCellData);
			} else if (dataType === "float") {
				cellContent = this.floatFormatter.format(rowCellData);
			} else {
				cellContent = `unknown number type: ${columnDefinition.type} should be ${dataType}, got: ${rowCellData}`;
			}
		} else if (typeof rowCellData === "string") {
			cellContent = rowCellData;
		} else if (Array.isArray(rowCellData) && rowCellData.length === 3) {
			if (rowCellData[0] === 1900) {
				cellContent = "–";
			} else {
				cellContent = moment.utc(rowCellData).format("YYYY-MM-DD");
			}
		} else if (rowCellData != null) {
			cellContent = `${typeof rowCellData}: ${rowCellData}`;
		}

		return <td
			key={idx.toString()}
			className={classnames({
				[`listCell-type-${columnDefinition.type}`]: true,
				[`listCell-dataType-${dataType}`]: true
			})}>
			{cellContent}
		</td>;
	};

	private renderUserName(
		actorId: number,
		userName: string,
		columnDefinition: UserNameListColumn
	): React.ReactNode {
		const userLinks: React.ReactNode[] = [];

		if (columnDefinition.addUserLinks) {
			userLinks.push(
				<MenuItem key="userPage"
					href={ListByIdPage.makeWikiLink(this.props.wikiBaseUrl, `User:${userName}`)}
					target="_blank"
					rel="noreferrer"
					icon="user"
					text={this.t("lists.userLinks.userPage")}
				/>,
				<MenuItem key="talkPage"
					href={ListByIdPage.makeWikiLink(this.props.wikiBaseUrl, `User talk:${userName}`)}
					target="_blank"
					rel="noreferrer"
					icon="chat"
					text={this.t("lists.userLinks.talkPage")}
				/>,
				<MenuDivider key="divider1" />,
				<MenuItem key="contributions"
					href={ListByIdPage.makeWikiLink(this.props.wikiBaseUrl, `Special:Contributions/${userName}`)}
					target="_blank"
					rel="noreferrer"
					icon="history"
					text={this.t("lists.userLinks.contributions")}
				/>,
				<MenuItem key="xToolsEditCounter"
					href={ListByIdPage.makeXToolsLink("ec", this.props.wikiBaseUrl, userName)}
					target="_blank"
					rel="noreferrer"
					icon="numerical"
					text={this.t("lists.userLinks.xToolsEditCounter")}
				/>,
				<MenuItem key="xToolsPagesCreated"
					href={ListByIdPage.makeXToolsLink("pages", this.props.wikiBaseUrl, userName)}
					target="_blank"
					rel="noreferrer"
					icon="insert"
					text={this.t("lists.userLinks.xToolsPagesCreated")}
				/>,
				<MenuDivider key="divider2" />,
				<MenuItem key="rights"
					href={ListByIdPage.makeWikiLink(this.props.wikiBaseUrl, `Special:UserRights/${userName}`)}
					target="_blank"
					rel="noreferrer"
					icon="hat"
					text={this.t("lists.userLinks.rightsLog")}
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

	private renderUserNameList(users: GroupActor[]): JSX.Element {
		if (!users || Array.isArray(users) === false)
			return <></>;

		return <>
			{users.map((actor, idx) => <React.Fragment key={idx}>
				<a href={ListByIdPage.makeWikiLink(this.props.wikiBaseUrl, `User:${actor.name}`)}
					rel="noreferrer"
					target="_blank">
					{actor.name}
				</a>{idx < users.length - 1 && ", "}
			</React.Fragment>)}
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

	private static makeXToolsLink(tool: string, wikiBaseUrl: string | null, userName: string): string | undefined {
		return `https://xtools.wmflabs.org/${tool}/${wikiBaseUrl}/${userName}`;
	}

	private getDisplayedColumnList(): ListColumn[] {
		if (!this.listData || !this.listData.list)
			return [];

		if (!this.listData.list.groupBy || this.listData.list.groupBy.length === 0)
			return this.listData.list.columns;

		const ret: ListColumn[] = [];
		for (const columnId of this.listData.list.groupBy) {
			const referencedColumn = this.listData.list.columns.find(x => x.columnId === columnId);
			if (referencedColumn) {
				ret.push(referencedColumn);
			} else {
				console.log(`could not find column with id: ${columnId}`);
			}
		}

		ret.push({
			type: "userNames",
			headerI18nKey: "lists.header.users",
		});

		return ret;
	}
}

export const getServerSideProps = async (ctx: NextPageContext): Promise<GetPortalServerSidePropsResult<ListByIdPageProps>> => {
	const appCtx = AppRunningContext.getInstance("portal");

	const wiki = appCtx.getKnownWikiById(typeof ctx.query["wiki"] === "string" ? ctx.query["wiki"] : undefined);
	const listsModule = moduleManager.getModuleById<ListsModule>(MODULE_IDENTIFIERS.lists);
	const list = listsModule?.getListByFullId(wiki?.id, typeof ctx.query["fullListId"] === "string" ? ctx.query["fullListId"] : undefined);

	const ret = await withCommonServerSideProps<ListByIdPageProps>(ctx, {
		wikiFound: !!wiki,
		wikiId: wiki?.id ?? null,
		wikiBaseUrl: wiki?.domain ?? null,
		listFound: !!list,
		list: list ?? null,
	});
	return ret;
};

export default withRouter(ListByIdPage);

