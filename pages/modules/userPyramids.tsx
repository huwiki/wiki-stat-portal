import { AnchorButton, Button, IconName, Intent, Spinner } from "@blueprintjs/core";
import Axios from "axios";
import { format, isSameDay } from "date-fns";
import { computed, makeObservable, observable } from "mobx";
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
import { UserPyramidGroup, WikiUserPyramidConfigurations } from "../../common/modules/userPyramids/userPyramidConfiguration";
import { ParameterBox } from "../../components/parameterBox";
import { ParameterGroup } from "../../components/parameterGroup";
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

interface SeriesData {
	population: number;
	matchingWithPreviousGroup: number;
}

class UserPyramidSeries {
	public date: Date = today;
	public data: SeriesData[] = [];

	public isLoading: boolean = true;
	public failedToLoad: boolean = false;

	constructor() {
		makeObservable(this, {
			date: observable,
			isLoading: observable,
			failedToLoad: observable,
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

	get isProperPyramidSelected(): boolean {
		return this.selectedWiki
			&& this.selectedWiki.id !== ""
			&& this.selectedUserPyramid
			&& this.selectedUserPyramid.id !== "";
	}

	get isAddPyramidSeriesDisabled(): boolean {
		return this.userPyramidSeries.length >= 5
			|| !this.isProperPyramidSelected
			|| !!this.userPyramidSeries.find(x => isSameDay(x.date, this.newUserPyramidSeries.date));
	}

	constructor(props: UserPyramidModulePageProps) {
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
			selectableWikis: observable,
			selectedUserPyramid: observable,
			userPyramidSeries: observable,
			isAddPyramidSeriesDisabled: computed,
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

			{this.renderPyramidVisualization()}
		</PageFrame>;
	}

	private renderPyramidVisualization() {
		if (this.userPyramidSeries.length === 0
			|| this.userPyramidSeries.findIndex(x => x.isLoading === false && x.failedToLoad === false) === -1) {
			return "Nothing to visualize";
		}

		const wikiPyramids = this.props.userPyramids.find(x => x.wiki === this.selectedWiki.id);
		if (!wikiPyramids || wikiPyramids.valid === false)
			return "¯\\_(ツ)_/¯";

		const pyramid = wikiPyramids.userPyramids.find(x => x.id === this.selectedUserPyramid.id);
		if (!pyramid)
			return "¯\\_(ツ)_/¯";

		return <PyramidVisualization
			title={this.selectedUserPyramid.label}
			seriesDescriptions={
				this.userPyramidSeries
					.filter(x => x.isLoading === false && x.failedToLoad === false)
					.map(x => moment(x.date).format("LL"))
			}
			showIntersectionWithPreviousGroup={pyramid.showIntersectionWithPreviousGroup === true}
			groups={pyramid.groups.map((group, index) => ({
				id: index.toString(),
				description: group.name,
				tooltip: this.renderGroupDescriptionTooltip(group),
				seriesValues: this.userPyramidSeries
					.filter(x => x.isLoading === false && x.failedToLoad === false)
					.map(x => ({
						value: x.data[index].population,
						commonWithPreviousGroup: x.data[index].matchingWithPreviousGroup
					}))
			}))}
			locale={this.props.languageCode}
			translatorFunction={this.t}
		/>;
	}

	private renderGroupDescriptionTooltip(group: UserPyramidGroup) {
		return <>
			<b>{this.t("userPyramids.groupRequirements")}</b>
			<ul>
				{group.requirements.registrationStatus === "anon"
					&& <li key="anonUser">{this.t("userPyramids.groupRequirements.registrationStatus.anon")}</li>}

				{group.requirements.registrationStatus === "registered"
					&& <li key="registeredUser">{
						this.t("userPyramids.groupRequirements.registrationStatus.registered")
					}</li>}

				{typeof group.requirements.registrationAgeAtLeast !== "undefined"
					&& <li key="regAgeAtLeast">{
						this.t("userPyramids.groupRequirements.registrationAgeAtLeast")
							.replace("{0}", group.requirements.registrationAgeAtLeast.toString())
					}</li>}

				{typeof group.requirements.registrationAgeAtMost !== "undefined"
					&& <li key="regAgeAtMost">{
						this.t("userPyramids.groupRequirements.registrationAgeAtMost")
							.replace("{0}", group.requirements.registrationAgeAtMost.toString())
					}</li>}

				{typeof group.requirements.userGroups !== "undefined"
					&& <li key="userGroups">{
						this.t("userPyramids.groupRequirements.memberOfUsergroups")
							.replace("{0}", group.requirements.userGroups.join(", "))
					}</li>}

				{typeof group.requirements.totalEditsAtLeast === "number"
					&& <li key="totalEditsAtLeast.simple">{
						this.t("userPyramids.groupRequirements.totalEditsAtLeast.simple")
							.replace("{0}", group.requirements.totalEditsAtLeast.toString())
					}</li>}

				{typeof group.requirements.totalEditsAtLeast !== "undefined"
					&& typeof group.requirements.totalEditsAtLeast !== "number"
					&& <li key="totalEditsAtLeast.withEpoch">{
						this.t("userPyramids.groupRequirements.totalEditsAtLeast.withEpock")
							.replace("{0}", group.requirements.totalEditsAtLeast.epoch.toString())
							.replace("{1}", group.requirements.totalEditsAtLeast.edits.toString())
					}</li>}

				{typeof group.requirements.totalEditsAtMost === "number"
					&& <li key="totalEditsAtMost.simple">{
						this.t("userPyramids.groupRequirements.totalEditsAtLeast.simple")
							.replace("{0}", group.requirements.totalEditsAtMost.toString())
					}</li>}

				{typeof group.requirements.totalEditsAtMost !== "undefined"
					&& typeof group.requirements.totalEditsAtMost !== "number"
					&& <li key="totalEditsAtMost.withEpoch">{
						this.t("userPyramids.groupRequirements.totalEditsAtMost.withEpock")
							.replace("{0}", group.requirements.totalEditsAtMost.epoch.toString())
							.replace("{1}", group.requirements.totalEditsAtMost.edits.toString())
					}</li>}

				{typeof group.requirements.inPeriodEditsAtLeast !== "undefined"
					&& typeof group.requirements.inPeriodEditsAtLeast.epoch === "undefined"
					&& <li key="inPeriodEditsAtLeast.simple">{
						this.t("userPyramids.groupRequirements.inPeriodEditsAtLeast.simple")
							.replace("{0}", group.requirements.inPeriodEditsAtLeast.period.toString())
							.replace("{1}", group.requirements.inPeriodEditsAtLeast.edits.toString())
					}</li>}

				{typeof group.requirements.inPeriodEditsAtLeast !== "undefined"
					&& typeof group.requirements.inPeriodEditsAtLeast.epoch === "number"
					&& <li key="inPeriodEditsAtLeast.withEpoch">{
						this.t("userPyramids.groupRequirements.inPeriodEditsAtLeast.withEpoch")
							.replace("{0}", group.requirements.inPeriodEditsAtLeast.epoch.toString())
							.replace("{1}", group.requirements.inPeriodEditsAtLeast.period.toString())
							.replace("{2}", group.requirements.inPeriodEditsAtLeast.edits.toString())
					}</li>}

				{typeof group.requirements.inPeriodEditsAtMost !== "undefined"
					&& typeof group.requirements.inPeriodEditsAtMost.epoch === "undefined"
					&& <li key="inPeriodEditsAtMost.simple">{
						this.t("userPyramids.groupRequirements.inPeriodEditsAtMost.simple")
							.replace("{0}", group.requirements.inPeriodEditsAtMost.period.toString())
							.replace("{1}", group.requirements.inPeriodEditsAtMost.edits.toString())
					}</li>}

				{typeof group.requirements.inPeriodEditsAtMost !== "undefined"
					&& typeof group.requirements.inPeriodEditsAtMost.epoch === "number"
					&& <li key="inPeriodEditsAtMost.withEpoch">{
						this.t("userPyramids.groupRequirements.inPeriodEditsAtMost.withEpoch")
							.replace("{0}", group.requirements.inPeriodEditsAtMost.epoch.toString())
							.replace("{1}", group.requirements.inPeriodEditsAtMost.period.toString())
							.replace("{2}", group.requirements.inPeriodEditsAtMost.edits.toString())
					}</li>}
			</ul>
		</>;
	}

	private renderModuleParameters() {
		return <ParameterBox>
			<div className={userPyramidsStyles.resetButton}>
				<Button
					icon="reset"
					intent={Intent.DANGER}
					minimal
					outlined
					onClick={this.resetAll}
					text={this.t("button.reset")} />
			</div>
			<ParameterGroup title={this.t("userPyramids.basicParameters")}>
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
					disabled={this.userPyramidSeries.length > 0}
				/>

				<SelectInput<SelectableValue>
					value={this.selectedUserPyramid}
					setValue={this.setSelectedUserPyramid}
					itemKeySelector={ele => ele.id}
					items={this.selectableUserPyramids}
					itemRenderer={ele => ele.label}
					inputLabel={this.t("input.userPyramid.label")}
					noSearchResultsLabel={this.t("input.noSearchResults")}
					noSelectedItemsLabel={this.t("input.userPyramid.noSelectedItem")}
					filterLabel={this.t("input.userPyramid.filterPlaceholder")}
					itemPredicate={(queryString, ele) => ele.label.indexOf(queryString) !== -1}
					disabled={this.userPyramidSeries.length > 0}
				/>
			</ParameterGroup>
			<ParameterGroup title={this.t("userPyramids.series")}>
				{this.renderExistingSeries()}
				{this.renderAddSeriesControls()}
				{this.userPyramidSeries.length >= 5 && <div className={userPyramidsStyles.maxNumberOfSeriesReached}>
					{this.t("userPyramids.maxNumberOfSeriesReached")}
				</div>}
			</ParameterGroup>
		</ParameterBox>;
	}

	private renderExistingSeries(): React.ReactNode {
		if (this.userPyramidSeries.length === 0) {
			return <div key="noSeries" className={userPyramidsStyles.visibleSeries}>
				{this.t("userPyramids.noSeriesAdded")}
			</div>;
		}

		return this.userPyramidSeries.map(series => <div key={format(series.date, "yyyy-MM-dd")}
			className={userPyramidsStyles.visibleSeries}>
			{moment(series.date).format("LL")}
			{series.isLoading
				&& <Spinner size={16} />}
			{series.failedToLoad
				&& <span className={userPyramidsStyles.seriesFailedToLoad}>
					{this.t("userPyramids.seriesFailedToLoad")}
				</span>}
			<AnchorButton
				icon="cross"
				small
				intent={Intent.DANGER}
				minimal
				onClick={this.deleteSeries(series)} />
		</div>);
	}

	private renderAddSeriesControls(): React.ReactNode {
		return <>
			<DateInput
				value={this.newUserPyramidSeries.date}
				setValue={this.setNewPyramidDate}
				localizationProvider={this.getDateInputLocalizationProvider()}
				maxDate={today}
				disabled={!this.isProperPyramidSelected}
			/>

			<Button icon="plus" intent={Intent.PRIMARY} minimal outlined
				onClick={this.addSeries}
				disabled={this.isAddPyramidSeriesDisabled}
				text={this.t("button.add")} />
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

	private resetAll = () => {
		this.userPyramidSeries = [];
		this.newUserPyramidSeries = new UserPyramidSeries();
		this.updateSelectedWiki(this.selectableWikis[0]);
	}

	private setSelectedUserPyramid = (selectedUserPyramid: SelectableValue) => {
		this.selectedUserPyramid = selectedUserPyramid;
	}

	private setNewPyramidDate = (date: Date) => {
		this.newUserPyramidSeries.date = date;
	}

	private addSeries = async (): Promise<void> => {
		const newlyAddedSeries = this.newUserPyramidSeries;
		this.userPyramidSeries.push(newlyAddedSeries);
		this.newUserPyramidSeries = new UserPyramidSeries();
		this.newUserPyramidSeries.date = moment(newlyAddedSeries.date).toDate();

		try {
			const resp = await Axios.get(
				"/api/userPyramids/seriesData?"
				+ `wikiId=${this.selectedWiki.id}`
				+ `&pyramidId=${this.selectedUserPyramid.id}`
				+ `&date=${format(newlyAddedSeries.date, "yyyy-MM-dd")}`,
				{ timeout: 100000 }
			);

			if (resp.status === 200) {
				newlyAddedSeries.data = resp.data;
				console.log(resp.data);
			} else {
				newlyAddedSeries.failedToLoad = true;
			}
			newlyAddedSeries.isLoading = false;
		}
		catch (err) {
			newlyAddedSeries.failedToLoad = true;
			newlyAddedSeries.isLoading = false;
		}

	}

	private deleteSeries = (series: UserPyramidSeries) => {
		return () => {
			const seriesIndex = this.userPyramidSeries.indexOf(series);
			if (seriesIndex !== -1) {
				this.userPyramidSeries.splice(seriesIndex, 1);
			}
		};
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
