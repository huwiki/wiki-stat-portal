import { HTMLTable } from "@blueprintjs/core";
import { observer } from "mobx-react";
import moment from "moment";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import * as React from "react";
import { PageFrame } from "../client/components/pageFrame";
import { NextBasePage } from "../client/helpers/nextBasePage";
import { CommonPageProps } from "../common/interfaces/commonPageProps";
import { AppRunningContext } from "../server/appRunningContext";
import { WikiProcessedRevisions } from "../server/database/entities/toolsDatabase/wikiProcessedRevisions";
import { momentToNumberArray } from "../server/helpers/dateUtils";
import { withCommonServerSideProps } from "../server/helpers/serverSidePageHelpers";
import { GetPortalServerSidePropsResult } from "../server/interfaces/getPortalServerSidePropsResult";

interface WikiCacheStatusInfo {
	wikiId: string;
	lastRun: number[] | null;
	lastProcessedRevisionId: number;
	lastProcessedRevisionTimestamp: number[] | null;
	lastProcessedLogId: number;
	lastProcessedLogTimestamp: number[] | null;
}

interface WikiCacheStatusInfoPageProps extends CommonPageProps {
	wikiInfoList: WikiCacheStatusInfo[];
}

@observer
class WikiCacheStatusInfoPage extends NextBasePage<WikiCacheStatusInfoPageProps> {
	constructor(props: WikiCacheStatusInfoPageProps) {
		super(props);
	}

	public render(): JSX.Element {
		return <PageFrame
			icon={"cog"}
			title={this.t("cacheStatus.title")}
			router={this.props.router}
			i18nProvider={this.i18nProvider}>
			{this.renderContent()}
		</PageFrame>;
	}

	private renderContent(): JSX.Element {
		return <HTMLTable bordered striped condensed interactive>
			<thead>
				<tr>
					<th>{this.t("cacheStatus.header.wikiId")}</th>
					<th>{this.t("cacheStatus.header.lastRun")}</th>
					<th>{this.t("cacheStatus.header.lastProcessedRevision")}</th>
					<th>{this.t("cacheStatus.header.lastProcessedLogEntry")}</th>
				</tr>
			</thead>
			<tbody>
				{this.props.wikiInfoList?.map(x => <tr key={x.wikiId}>
					<td>{x.wikiId}</td>
					<td>
						{x.lastRun
							? moment.utc(x.lastRun).format("YYYY-MM-DD HH:mm:ss")
							: "–"}
					</td>
					<td>
						<b>{this.t("cacheStatus.dbId")}</b> <code>{x.lastProcessedRevisionId}</code>
						<br />
						<b>{this.t("cacheStatus.timestamp")}</b> {x.lastProcessedRevisionTimestamp
							? moment.utc(x.lastProcessedRevisionTimestamp).format("YYYY-MM-DD HH:mm:ss")
							: "–"}
					</td>
					<td>
						<b>{this.t("cacheStatus.dbId")}</b> <code>{x.lastProcessedLogId}</code>
						<br />
						<b>{this.t("cacheStatus.timestamp")}</b> {x.lastProcessedLogTimestamp
							? moment.utc(x.lastProcessedLogTimestamp).format("YYYY-MM-DD HH:mm:ss")
							: "–"}
					</td>
				</tr>)}
			</tbody>
		</HTMLTable>;
	}
}

export const getServerSideProps = async (ctx: NextPageContext): Promise<GetPortalServerSidePropsResult<WikiCacheStatusInfoPageProps>> => {
	const appCtx = AppRunningContext.getInstance("portal");
	const conn = await appCtx.getToolsDbConnection();

	const dbWprs = await conn.getRepository(WikiProcessedRevisions)
		.createQueryBuilder("wpr")
		.getMany();

	const wikiInfoList: WikiCacheStatusInfo[] = [];
	for (const dbWpr of dbWprs) {
		wikiInfoList.push({
			wikiId: dbWpr.wiki,
			lastRun: dbWpr.lastRun
				? momentToNumberArray(moment.utc(dbWpr.lastRun))
				: null,
			lastProcessedRevisionId: dbWpr.lastProcessedRevisionId,
			lastProcessedRevisionTimestamp: dbWpr.lastProcessedLogTimestamp
				? momentToNumberArray(moment.utc(dbWpr.lastProcessedRevisionTimestamp))
				: null,
			lastProcessedLogId: dbWpr.lastProcessedLogId,
			lastProcessedLogTimestamp: dbWpr.lastProcessedLogTimestamp
				? momentToNumberArray(moment.utc(dbWpr.lastProcessedLogTimestamp))
				: null,
		});
	}

	const partial: Partial<WikiCacheStatusInfoPageProps> = {
		wikiInfoList: wikiInfoList,
	};

	conn.close();

	return await withCommonServerSideProps<WikiCacheStatusInfoPageProps>(ctx, partial);
};

export default withRouter(WikiCacheStatusInfoPage);
