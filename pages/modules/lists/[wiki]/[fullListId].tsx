import { observer } from "mobx-react";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import * as React from "react";
import { PageFrame } from "../../../../client/components/pageFrame";
import { NextBasePage } from "../../../../client/helpers/nextBasePage";
import { CommonPageProps } from "../../../../common/interfaces/commonPageProps";
import { isLocalizedListConfiguration, ListConfiguration } from "../../../../common/modules/lists/listsConfiguration";
import { MODULE_ICONS } from "../../../../common/modules/moduleIcons";
import { MODULE_IDENTIFIERS } from "../../../../common/modules/moduleIdentifiers";
import { AppRunningContext } from "../../../../server/appRunningContext";
import { withCommonServerSideProps } from "../../../../server/helpers/serverSidePageHelpers";
import { GetPortalServerSidePropsResult } from "../../../../server/interfaces/getPortalServerSidePropsResult";
import { ListsModule } from "../../../../server/modules/listsModule/listsModule";
import { moduleManager } from "../../../../server/modules/moduleManager";

interface ListByIdPageProps extends CommonPageProps {
	wikiFound: boolean;
	wikiId: string | null;
	listFound: boolean;
	list: ListConfiguration | null;
}

@observer
class ListByIdPage extends NextBasePage<ListByIdPageProps> {
	constructor(props: ListByIdPageProps) {
		super(props);
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

		</PageFrame>;
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
		listFound: !!list,
		list: list ?? null,
	});
};

export default withRouter(ListByIdPage);
