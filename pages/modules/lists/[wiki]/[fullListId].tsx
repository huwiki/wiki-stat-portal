import { HTMLTable, Spinner } from "@blueprintjs/core";
import Axios from "axios";
import { makeObservable, observable } from "mobx";
import { observer } from "mobx-react";
import moment from "moment";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import * as React from "react";
import { PageFrame } from "../../../../client/components/pageFrame";
import { NextBasePage } from "../../../../client/helpers/nextBasePage";
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

	constructor(props: ListByIdPageProps) {
		super(props);

		makeObservable(this, {
			isLoading: observable,
			failedToLoad: observable,
			data: observable,
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
					startDate: "2021-11-13",
					endDate: "2021-11-15",
					languageCode: this.props.languageCode
				},
				{ timeout: 100000 }
			);

			if (resp.status === 200) {
				this.data = resp.data;
			} else {
				this.failedToLoad = true;
			}
			this.isLoading = false;
		}
		catch (err) {
			this.failedToLoad = true;
			this.isLoading = false;
		}
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
		return <HTMLTable bordered striped condensed interactive>
			<thead>
				{this.renderTableColumnHeaders()}
			</thead>
			<tbody>
				{this.renderTableRows()}
			</tbody>
		</HTMLTable>;
	}

	private renderTableColumnHeaders(): React.ReactNode {
		return this.data.list.columns.map((col, idx) => <th key={idx.toString()}>
			{col.headerI18nKey ? this.t(col.headerI18nKey) : col.type}
		</th>);
	}

	private renderTableRows(): React.ReactNode {
		return this.data.results.map((row) => <tr key={row.id.toString()}>
			{this.renderTableRow(row.id, row.data)}
		</tr>);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private renderTableRow(actorId: number, data: any[]): React.ReactNode {
		return data.map((data, idx) => {
			const columnDefinition = this.data.list.columns[idx];

			let cellContent: React.ReactNode = "?";
			if (columnDefinition.type === "counter") {
				cellContent = `${data}.`;
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
				cellContent = data.toString();
			} else if (typeof data === "string") {
				cellContent = data;
			} else if (Array.isArray(data) && data.length === 3) {
				cellContent = moment.utc(data).format("YYYY-MM-DD");
			}

			return <td key={idx.toString()}>
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
				<a key="talkPage"
					href={ListByIdPage.makeWikiLink(this.props.wikiBaseUrl, `User talk:${userName}`)}
					target="_blank"
					rel="noreferrer"
				>
					vita
				</a>
			);
		}

		if (columnDefinition.userLinks?.edits === true) {
			userLinks.push(
				<a key="contributions"
					href={ListByIdPage.makeWikiLink(this.props.wikiBaseUrl, `Special:Contributions/${userName}`)}
					target="_blank"
					rel="noreferrer"
				>
					szerk.
				</a>
			);
		}

		return <>
			<b>{userName}</b>
			{userLinks.length > 0 && <>
				{" "}
				( {userLinks.map((ele, idx) => <React.Fragment key={idx.toString()}>
					{idx > 0 && " | "}
					{ele}
				</React.Fragment>)} )
			</>}
			<br />
			<code>actorId: {actorId}</code>
		</>;
	}

	private renderUserGroups(groups: string[]) {
		if (!groups || Array.isArray(groups) === false)
			return "";

		const groupsLocalized = groups.map(group => this.t(`userGroup.${group}`));
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
