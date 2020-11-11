import { Button, IconName, Intent } from "@blueprintjs/core";
import { makeObservable, observable } from "mobx";
import { observer } from "mobx-react";
import moment from "moment";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import * as React from "react";
import { DateInput } from "../../client/components/inputs/dateInput";
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
import userPyramidsStyles from "./userPyramids.module.scss";

interface UserPyramidModulePageProps extends CommonPageProps {
	supportedWikis: string[];
	moduleFound: boolean;
	moduleId: string | null;
	moduleIcon: IconName | null;
	userPyramids: WikiUserPyramidConfigurations[];
}

const today = moment().startOf("day").toDate();

class UserPyramidSeries {
	public date: Date = today;

	constructor() {
		makeObservable(this, {

			date: observable
		});
	}
}

@observer
class UserPyramidModulePage extends NextBasePage<UserPyramidModulePageProps> {
	selectedWiki: SelectableValue;
	selectableWikis: SelectableValue[] = [];
	selectedUserPyramid: SelectableValue;
	selectableUserPyramids: SelectableValue[] = [];

	newUserPyramidSeries: UserPyramidSeries = new UserPyramidSeries();
	userPyramidSeries: UserPyramidSeries[] = [];

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

		makeObservable(this, {
			selectedWiki: observable,
			selectableWikis: observable,
			selectedUserPyramid: observable,
			userPyramidSeries: observable,
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
				{this.renderModuleParameters()}
			</div>

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

	private renderModuleParameters() {
		return <>
			<div className={userPyramidsStyles.addNewSeries}>
				<div className={userPyramidsStyles.addNewSeriesTitle}>
					{this.t("userPyramids.basicParameters")}
				</div>
				<div className={userPyramidsStyles.addNewSeriesParameters}>
					<SelectInput<SelectableValue>
						value={this.selectedWiki}
						setValue={this.updateSelectedWiki}
						itemKeySelector={ele => ele.id}
						items={this.selectableWikis}
						itemRenderer={ele => ele.label}
						inputLabel={this.t("input.wiki.label")}
						noSearchResultsLabel={this.t("input.noSearchResults")}
						noSelectedItemsLabel={this.t("input.wiki.noSelectedItem")}
						filterLabel={this.t("input.wiki.filterPlaceholder")}
						itemPredicate={(queryString, ele) => ele.label.indexOf(queryString) !== -1}
					/>

					<SelectInput<SelectableValue>
						value={this.selectedUserPyramid}
						setValue={this.updateSelectedUserPyramid}
						itemKeySelector={ele => ele.id}
						items={this.selectableUserPyramids}
						itemRenderer={ele => ele.label}
						inputLabel={this.t("input.userPyramid.label")}
						noSearchResultsLabel={this.t("input.noSearchResults")}
						noSelectedItemsLabel={this.t("input.userPyramid.noSelectedItem")}
						filterLabel={this.t("input.userPyramid.filterPlaceholder")}
						itemPredicate={(queryString, ele) => ele.label.indexOf(queryString) !== -1}
					/>
				</div>
				<div className={userPyramidsStyles.addNewSeriesTitle}>
					{this.t("userPyramids.addNewSeries")}
				</div>
				<div className={userPyramidsStyles.addNewSeriesParameters}>

					<DateInput
						value={this.newUserPyramidSeries.date}
						setValue={this.updateNewPyramidDate}
						inputLabel={this.t("input.date.label")}
						maxDate={today}
					/>

					<Button
						icon="plus"
						intent={Intent.PRIMARY}
						onClick={this.addSeries}
						disabled={this.userPyramidSeries.length >= 5}
						text={this.t("button.add")} />
				</div>
				{this.userPyramidSeries.length >= 5 && <div className={userPyramidsStyles.maxNumberOfSeriesReached}>
					{this.t("userPyramids.maxNumberOfSeriesReached")}
				</div>}
			</div>
		</>;
	}

	private updateSelectedWiki = (selectedWiki: SelectableValue) => {
		this.selectedWiki = selectedWiki;

		const newSelectableUserPyramids: SelectableValue[] = [];
		newSelectableUserPyramids.push(new SelectableValue(
			"",
			this.t("input.userPyramid.noSelectedItem")
		));
		const wikiPyramids = this.props.userPyramids.find(x => x.wiki === selectedWiki.id);
		if (wikiPyramids && wikiPyramids.valid && wikiPyramids.userPyramids.length) {
			for (const pyramid of wikiPyramids.userPyramids) {
				newSelectableUserPyramids.push(new SelectableValue(pyramid.id, pyramid.name));
			}
		}

		this.selectedUserPyramid = newSelectableUserPyramids[0];
		this.selectableUserPyramids = newSelectableUserPyramids;
	}

	private updateSelectedUserPyramid = (selectedUserPyramid: SelectableValue) => {
		this.selectedUserPyramid = selectedUserPyramid;
	}

	private updateNewPyramidDate = (date: Date) => {
		this.newUserPyramidSeries.date = date;
	}

	private addSeries = () => {
		this.userPyramidSeries.push(this.newUserPyramidSeries);
		this.newUserPyramidSeries = new UserPyramidSeries();

		// TODO: load data
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