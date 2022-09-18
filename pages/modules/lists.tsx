import { Button, Card, Icon } from "@blueprintjs/core";
import { IconName } from "@blueprintjs/icons";
import classnames from "classnames";
import { makeObservable, observable } from "mobx";
import { observer } from "mobx-react";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import { PageFrame } from "../../client/components/pageFrame";
import { NextBasePage } from "../../client/helpers/nextBasePage";
import { SelectableValue } from "../../client/models/selectableValue";
import { CommonPageProps } from "../../common/interfaces/commonPageProps";
import { MODULE_ICONS } from "../../common/modules/moduleIcons";
import { MODULE_IDENTIFIERS } from "../../common/modules/moduleIdentifiers";
import { withCommonServerSideProps } from "../../server/helpers/serverSidePageHelpers";
import { GetPortalServerSidePropsResult } from "../../server/interfaces/getPortalServerSidePropsResult";
import { ListsModule } from "../../server/modules/listsModule/listsModule";
import { moduleManager } from "../../server/modules/moduleManager";
import indexPageStyles from "../../styles/indexPage.module.scss";

interface ListsModulePageProps extends CommonPageProps {
	supportedWikis: string[];
	moduleFound: boolean;
	moduleId: string | null;
	moduleIcon: IconName | null;
}

@observer
class ListsModulePage extends NextBasePage<ListsModulePageProps> {
	selectedWiki: SelectableValue;
	selectableWikis: SelectableValue[] = [];

	constructor(props: ListsModulePageProps) {
		super(props);

		this.selectableWikis.push(new SelectableValue(
			"",
			this.t("input.wiki.noSelectedItem")
		));
		for (const supportedwiki of props.supportedWikis) {
			this.selectableWikis.push(new SelectableValue(supportedwiki, supportedwiki));
		}

		makeObservable(this, {
			selectedWiki: observable,
			selectableWikis: observable
		});
	}

	public render(): JSX.Element {
		return <PageFrame
			icon={MODULE_ICONS[MODULE_IDENTIFIERS.lists]}
			title={this.t("module.lists")}
			router={this.props.router}
			i18nProvider={this.i18nProvider}>
			{this.renderListsPageContent()}
		</PageFrame>;
	}

	private renderListsPageContent(): JSX.Element {
		return <div className={indexPageStyles.moduleCardList}>
			{this.props.supportedWikis.map(wikiId => this.renderWikiCard(wikiId))}
		</div>;
	}

	private renderWikiCard(wikiId: string) {
		return <Card className={classnames("moduleCard")} key={wikiId}>
			<Icon className="moduleCardIcon" icon={this.getWikiIcon(wikiId)} iconSize={96} />
			<h3>{wikiId}</h3>
			<Button text={this.t("button.go")} rightIcon="caret-right" onClick={this.goToWikiListPage(wikiId)} />
		</Card>;
	}

	private goToWikiListPage(wikiId: string) {
		return () => {
			this.props.router.push(`/modules/lists/${wikiId}`);
		};
	}

	private getWikiIcon(wikiId: string): IconName {
		if (wikiId.endsWith("wiki")) {
			return "globe-network";
		} else if (wikiId.endsWith("wiktionary")) {
			return "translate";
		} else if (wikiId.endsWith("wikiquote")) {
			return "citation";
		} else if (wikiId.endsWith("wikisource")) {
			return "book";
		}

		return "cube";
	}
}

export const getServerSideProps = async (ctx: NextPageContext): Promise<GetPortalServerSidePropsResult<ListsModulePageProps>> => {
	const listsModule = moduleManager.getModuleById<ListsModule>(MODULE_IDENTIFIERS.lists);

	const partial: Partial<ListsModulePageProps> = {
		supportedWikis: listsModule?.availableAt ?? [],
		moduleFound: !!listsModule,
		moduleId: listsModule?.identifier,
		moduleIcon: listsModule?.icon,
	};

	return await withCommonServerSideProps<ListsModulePageProps>(ctx, partial);
};

export default withRouter(ListsModulePage);
