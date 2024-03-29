import { Button, Card, Icon } from "@blueprintjs/core";
import classnames from "classnames";
import { makeObservable, observable } from "mobx";
import { observer } from "mobx-react";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import { SelectInput } from "../client/components/inputs/selectInput";
import { PageFrame } from "../client/components/pageFrame";
import { NextBasePage } from "../client/helpers/nextBasePage";
import { SelectableValue } from "../client/models/selectableValue";
import { CommonPageProps } from "../common/interfaces/commonPageProps";
import { ModuleDescriptor } from "../common/interfaces/moduleDescriptor";
import { withCommonServerSideProps } from "../server/helpers/serverSidePageHelpers";
import { GetPortalServerSidePropsResult } from "../server/interfaces/getPortalServerSidePropsResult";
import indexPageStyles from "../styles/indexPage.module.scss";

const REQUIRED_LANGUAGE_GROUPS = [
	"common",
	"indexPage"
];

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IndexPageProps extends CommonPageProps {
}

@observer
class IndexPage extends NextBasePage<IndexPageProps> {
	selectableWikis = [
		new SelectableValue("", "No items selected"),
	]
	selectedWiki: SelectableValue | null = null;

	constructor(props: IndexPageProps) {
		super(props);

		for (const wiki of props.availableWikis) {
			this.selectableWikis.push(new SelectableValue(wiki, wiki));
		}

		makeObservable(this, {
			selectedWiki: observable
		});

		// TODO: this should happen elsewhere
		this.selectableWikis[0].label = this.t("indexPage.noFilterByWiki");
		this.selectedWiki = this.selectableWikis[0];
	}

	public render(): JSX.Element {
		return <PageFrame
			icon="application"
			title={this.t("indexPage.title")}
			router={this.props.router}
			i18nProvider={this.i18nProvider}>

			{this.renderIndexPageIntro()}
			{this.renderAvailableModuleList()}
		</PageFrame>;
	}

	private renderIndexPageIntro() {
		return <div className={indexPageStyles.intro}>
			<div className={indexPageStyles.introText}>{this.t("indexPage.description")}</div>
			<div className={indexPageStyles.wikiSelector}>
				{this.t("indexPage.filterByWiki")}&nbsp;
				<SelectInput<SelectableValue | null>
					value={this.selectedWiki}
					setValue={this.updateSelectedWiki}
					itemKeySelector={ele => ele?.id ?? ""}
					items={this.selectableWikis}
					itemRenderer={ele => ele?.label}
					noSearchResultsLabel={this.t("input.noSearchResults")}
					noSelectedItemsLabel={this.t("input.noSelectedItem")}
				/>
			</div>
		</div>;
	}

	private updateSelectedWiki = (selectedWiki: SelectableValue) => {
		this.selectedWiki = selectedWiki;
	}

	private renderAvailableModuleList(): JSX.Element | null {
		if (!this.props.availableModules)
			return null;

		return <div className={indexPageStyles.moduleCardList}>
			{this.props.availableModules
				.filter(x => x.availableAt.length > 0
					&& (this.selectedWiki?.id === ""
						|| (this.selectedWiki && x.availableAt.indexOf(this.selectedWiki.id) !== -1)))
				.map(x => this.renderModuleDetails(x, true))}
			{this.props.availableModules
				.filter(x => x.availableAt.length == 0
					|| (this.selectedWiki && this.selectedWiki.id !== "" && x.availableAt.indexOf(this.selectedWiki.id) === -1))
				.map(x => this.renderModuleDetails(x, false))}
		</div>;
	}

	private renderModuleDetails(module: ModuleDescriptor, isAvailable: boolean) {
		return <Card className={classnames("moduleCard", !isAvailable && "unavailable")} key={module.id}>
			<Icon className="moduleCardIcon" icon={module.icon} iconSize={96} />
			<h3>{this.t(`module.${module.id}`)}</h3>
			<p>{this.t(`module.${module.id}.description`)}</p>
			{this.renderModuleWarningsOrJumpButton(module, isAvailable)}
		</Card>;
	}

	private renderModuleWarningsOrJumpButton(module: ModuleDescriptor, isAvailable: boolean): JSX.Element | null {
		if (module.availableAt.length === 0) {
			return <span className={indexPageStyles.moduleUnavailable}>
				{this.t("indexPage.moduleNotAvailableOnAnyWikis")}
			</span>;
		}

		if (!isAvailable) {
			return <span className={indexPageStyles.moduleUnavailable}>
				{this.t("indexPage.moduleNotAvailableOnSelectedWiki")}
			</span>;
		}

		return <Button text={this.t("button.go")} rightIcon="caret-right" onClick={this.goToModulePage(module.id)} />;
	}

	private goToModulePage(moduleId: string) {
		return () => {
			this.props.router.push(`/modules/${moduleId}`);
		};
	}

}

export const getServerSideProps = async (ctx: NextPageContext): Promise<GetPortalServerSidePropsResult<IndexPageProps>> => {
	return await withCommonServerSideProps<IndexPageProps>(ctx, {}, REQUIRED_LANGUAGE_GROUPS);
};

export default withRouter(IndexPage);
