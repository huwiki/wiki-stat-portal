import { Callout, Intent } from "@blueprintjs/core";
import _ from "lodash";
import { observer } from "mobx-react";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import * as React from "react";
import { PageFrame } from "../../../client/components/pageFrame";
import { NextBasePage } from "../../../client/helpers/nextBasePage";
import { CommonPageProps } from "../../../common/interfaces/commonPageProps";
import { isLocalizedListConfiguration, ListConfiguration } from "../../../common/modules/lists/listsConfiguration";
import { MODULE_ICONS } from "../../../common/modules/moduleIcons";
import { MODULE_IDENTIFIERS } from "../../../common/modules/moduleIdentifiers";
import { AppRunningContext } from "../../../server/appRunningContext";
import { withCommonServerSideProps } from "../../../server/helpers/serverSidePageHelpers";
import { GetPortalServerSidePropsResult } from "../../../server/interfaces/getPortalServerSidePropsResult";
import { ListsModule } from "../../../server/modules/listsModule/listsModule";
import { moduleManager } from "../../../server/modules/moduleManager";
import styles from "./[wiki].module.scss";

interface WikiListsPageProps extends CommonPageProps {
	wikiFound: boolean;
	wikiId: string | null;
	lists: ListConfiguration[] | null;
}

@observer
class WikiListsPage extends NextBasePage<WikiListsPageProps> {
	constructor(props: WikiListsPageProps) {
		super(props);
	}

	public render(): JSX.Element {
		if (!this.props.wikiFound) {
			return this.render404Page();
		}

		return <PageFrame
			parents={[
				{ content: this.t("module.lists"), routeLink: "/modules/lists" }
			]}
			icon={MODULE_ICONS[MODULE_IDENTIFIERS.lists]}
			title={this.props.wikiId}
			router={this.props.router}
			i18nProvider={this.i18nProvider}>
			{this.renderLists()}
		</PageFrame>;
	}

	private renderLists() {
		if (!this.props.lists || this.props.lists.length === 0) {
			return <Callout intent={Intent.NONE} icon="info-sign">
				{this.t("lists.wikiHasNoListsConfigured")}
			</Callout>;
		}

		const groups = _.groupBy(this.props.lists, x => x.groupId);
		return <div className={styles.listContainer}>
			{Object.keys(groups).map(listGroupKey => {
				return this.renderList(listGroupKey, groups[listGroupKey]);
			})}
		</div>;
	}

	private renderList(listGroupKey: string, listItems: ListConfiguration[]): JSX.Element {
		return <div className={styles.group} key={listGroupKey}>
			<h4>{this.t(`lists.group.${listGroupKey}`)}</h4>
			<ul>
				{listItems.map(l => <li key={l.id}>
					<a onClick={this.goToListPage(this.props.wikiId, `${l.groupId}.${l.id}`)}>
						{isLocalizedListConfiguration(l) ? this.t(l.i18nKey) : l.name}
					</a>
				</li>)}
			</ul>
		</div>;
	}

	private goToListPage(wikiId: string | null, listId?: string) {
		return () => {
			this.props.router.push(`/modules/lists/${wikiId}/${listId}`);
		};
	}
}

export const getServerSideProps = async (ctx: NextPageContext): Promise<GetPortalServerSidePropsResult<WikiListsPageProps>> => {

	const appCtx = AppRunningContext.getInstance("portal");

	const wiki = appCtx.getKnownWikiById(typeof ctx.query["wiki"] === "string" ? ctx.query["wiki"] : undefined);
	const listsModule = moduleManager.getModuleById<ListsModule>(MODULE_IDENTIFIERS.lists);

	return await withCommonServerSideProps<WikiListsPageProps>(ctx, {
		wikiFound: !!wiki,
		wikiId: wiki?.id ?? null,
		lists: listsModule?.getListsByWikiId(wiki?.id) ?? null,
	});
};

export default withRouter(WikiListsPage);
