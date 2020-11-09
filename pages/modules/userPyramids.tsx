import { IconName } from "@blueprintjs/core";
import { makeObservable, observable } from "mobx";
import { observer } from "mobx-react";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import * as React from "react";
import { SelectInput } from "../../client/components/inputs/selectInput";
import { PageFrame } from "../../client/components/pageFrame";
import { NextBasePage } from "../../client/helpers/nextBasePage";
import { SelectableValue } from "../../client/models/selectableValue";
import { CommonPageProps } from "../../common/interfaces/commonPageProps";
import { WikiUserPyramidConfigurations } from "../../common/modules/userPyramids/userPyramidConfiguration";
import { PyramidVisualization } from "../../components/pyramidVisualization";
import { withCommonServerSideProps } from "../../server/helpers/serverSidePageHelpers";
import { GetServerSidePropsResult } from "../../server/interfaces/getServerSidePropsResult";
import { moduleManager } from "../../server/modules/moduleManager";
import { UserPyramidsModule } from "../../server/modules/userPyramidsModule/userPyramidsModule";

interface UserPyramidModulePageProps extends CommonPageProps {
	supportedWikis: string[];
	moduleFound: boolean;
	moduleId: string | null;
	moduleIcon: IconName | null;
	userPyramids: WikiUserPyramidConfigurations[];
}

@observer
class UserPyramidModulePage extends NextBasePage<UserPyramidModulePageProps> {
	selectableWikis: SelectableValue[] = [];
	selectedWiki: SelectableValue;

	constructor(props: UserPyramidModulePageProps) {
		super(props);

		console.log(this.props.userPyramids);

		this.selectableWikis.push(new SelectableValue(
			"",
			this.t("input.wiki.noSelectedItem")
		));
		for (const supportedwiki of props.supportedWikis) {
			this.selectableWikis.push(new SelectableValue(supportedwiki, supportedwiki));
		}

		this.selectedWiki = this.selectableWikis[0];

		makeObservable(this, {
			selectableWikis: observable,
			selectedWiki: observable
		});
	}

	public render(): JSX.Element {
		if (!this.props.moduleFound) {
			return this.render404Page();
		}

		return <PageFrame
			icon="horizontal-bar-chart-desc"
			title={this.t("module.userPyramids")}
			router={this.props.router}
			i18nProvider={this.i18nProvider}>

			<div className="moduleParameters">
				<SelectInput<SelectableValue>
					value={this.selectedWiki}
					setValue={this.updateSelectedWiki}
					itemKeySelector={ele => ele.id}
					items={this.selectableWikis}
					itemRenderer={ele => ele.label}
					noSearchResultsLabel={this.t("input.noSearchResults")}
					noSelectedItemsLabel={this.t("input.wiki.noSelectedItem")}
					filterLabel={this.t("input.wiki.filterPlaceholder")}
					itemPredicate={(queryString, ele) => ele.label.indexOf(queryString) !== -1}
				/>
			</div>

			{this.selectedWiki.label}

			<PyramidVisualization
				title="I. szerkesztői piramis"
				seriesDescriptions={["2020. 10. 01."]}
				groups={[{
					description: "anon szerkesztők",
					seriesValues: [{ value: 734, commonWithPreviousGroup: 0 }]
				}, {
					description: "1+ regisztrált szerkesztők",
					seriesValues: [{ value: 324, commonWithPreviousGroup: 40 }]
				}, {
					description: "5+ regisztrált szerkesztők",
					seriesValues: [{ value: 134, commonWithPreviousGroup: 134 }]
				}, {
					description: "100+ regisztrált szerkesztők",
					seriesValues: [{ value: 12, commonWithPreviousGroup: 1 }]
				}]}
				translatorFunction={this.t}
			/>

			<PyramidVisualization
				title="I. szerkesztői piramis"
				seriesDescriptions={["2020. 10. 01."]}
				groups={[{
					description: "anon szerkesztők",
					seriesValues: [{ value: 734, commonWithPreviousGroup: 0 }]
				}, {
					description: "1+ regisztrált szerkesztők",
					seriesValues: [{ value: 1111, commonWithPreviousGroup: 40 }]
				}, {
					description: "5+ regisztrált szerkesztők",
					seriesValues: [{ value: 134, commonWithPreviousGroup: 134 }]
				}, {
					description: "100+ regisztrált szerkesztők",
					seriesValues: [{ value: 12, commonWithPreviousGroup: 1 }]
				}]}
				translatorFunction={this.t}
			/>

			<PyramidVisualization
				title="I. szerkesztői piramis"
				seriesDescriptions={[
					"2020. 09. 01.",
					"2020. 10. 01."
				]}
				groups={[{
					description: "anon szerkesztők",
					seriesValues: [
						{ value: 734, commonWithPreviousGroup: 0 },
						{ value: 525, commonWithPreviousGroup: 0 }
					]
				}, {
					description: "1+ regisztrált szerkesztők",
					seriesValues: [
						{ value: 324, commonWithPreviousGroup: 140 },
						{ value: 235, commonWithPreviousGroup: 222 }
					]
				}, {
					description: "5+ regisztrált szerkesztők",
					seriesValues: [
						{ value: 134, commonWithPreviousGroup: 100 },
						{ value: 111, commonWithPreviousGroup: 23 }
					]
				}, {
					description: "100+ regisztrált szerkesztők",
					seriesValues: [
						{ value: 12, commonWithPreviousGroup: 10 },
						{ value: 53, commonWithPreviousGroup: 20 }
					]
				}]}
				translatorFunction={this.t}
			/>

		</PageFrame>;
	}

	private updateSelectedWiki = (selectedWiki: SelectableValue) => {
		this.selectedWiki = selectedWiki;
	}
}

export const getServerSideProps = async (ctx: NextPageContext): Promise<GetServerSidePropsResult<UserPyramidModulePageProps>> => {
	const userPyramidsModule = moduleManager.getModuleById<UserPyramidsModule>("userPyramids");

	return await withCommonServerSideProps<UserPyramidModulePageProps>(ctx, {
		supportedWikis: userPyramidsModule?.availableAt || [],
		moduleFound: !!userPyramidsModule,
		moduleId: userPyramidsModule?.identifier,
		moduleIcon: userPyramidsModule?.icon,
		userPyramids: userPyramidsModule?.userPyramids
	});
};

export default withRouter(UserPyramidModulePage);
