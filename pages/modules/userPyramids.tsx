import { AnchorButton, Button, Callout, Icon, IconName, Intent, Spinner, Switch, Tooltip } from "@blueprintjs/core";
import Axios from "axios";
import { format, isSameDay } from "date-fns";
import { computed, makeObservable, observable } from "mobx";
import { observer } from "mobx-react";
import moment from "moment";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import * as React from "react";
import { InlineCallout } from "../../client/components/inlineCallout";
import { DateInput } from "../../client/components/inputs/dateInput";
import { SelectInput } from "../../client/components/inputs/selectInput";
import { PageFrame } from "../../client/components/pageFrame";
import { ParameterBox } from "../../client/components/parameterBox";
import { ParameterGroup } from "../../client/components/parameterGroup";
import { PyramidVisualization } from "../../client/components/userPyramids/pyramidVisualization";
import { NextBasePage } from "../../client/helpers/nextBasePage";
import { SelectableValue } from "../../client/models/selectableValue";
import { CommonPageProps } from "../../common/interfaces/commonPageProps";
import { UserPyramidGroup, WikiUserPyramidConfigurations } from "../../common/modules/userPyramids/userPyramidConfiguration";
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

	logScaleGraph: boolean = false;

	newUserPyramidSeries: UserPyramidSeries = new UserPyramidSeries();
	userPyramidSeries: UserPyramidSeries[] = [];

	get isProperPyramidSelected(): boolean {
		return this.selectedWiki
			&& this.selectedWiki.id !== ""
			&& this.selectedUserPyramid
			&& this.selectedUserPyramid.id !== "";
	}

	get isAddPyramidSeriesDisabled(): boolean {
		return this.userPyramidSeries.length >= 10
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
			logScaleGraph: observable,
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
		if (!this.selectedWiki || this.selectedWiki.id === "") {
			return this.renderNothingToVisualizeMessage();
		}

		const wikiPyramids = this.props.userPyramids.find(x => x.wiki === this.selectedWiki.id);
		if (!wikiPyramids || wikiPyramids.valid === false) {
			return <Callout
				icon="warning-sign"
				title={this.t("userPyramids.invalidPyramidConfiguration")}
				intent={Intent.WARNING}>
				{this.t("userPyramids.invalidPyramidConfiguration.description")}
			</Callout>;
		}

		if (this.userPyramidSeries.length === 0
			|| this.userPyramidSeries.findIndex(x => x.isLoading === false && x.failedToLoad === false) === -1) {
			return this.renderNothingToVisualizeMessage();
		}

		const pyramid = wikiPyramids.userPyramids.find(x => x.id === this.selectedUserPyramid.id);
		if (!pyramid)
			return "The selected pyramid does not exist";

		return <PyramidVisualization
			title={this.selectedUserPyramid.label}
			seriesDescriptions={
				this.userPyramidSeries
					.filter(x => x.isLoading === false && x.failedToLoad === false)
					.map(x => moment(x.date).format("LL"))
			}
			showIntersectionWithPreviousGroup={pyramid.showIntersectionWithPreviousGroup === true}
			logScaleGraph={this.logScaleGraph}
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

	private renderNothingToVisualizeMessage() {
		return <Callout
			icon="info-sign"
			title={this.t("userPyramids.nothingToVisualize")}
			intent={Intent.PRIMARY}>
			{this.t("userPyramids.nothingToVisualize.description")}
		</Callout>;
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
					&& group.requirements.userGroups.length === 1
					&& <li key="userGroups">{
						this.t("userPyramids.groupRequirements.memberOfUserGroup")
							.replace(
								"{0}",
								this.t(`userGroup.${group.requirements.userGroups[0]}`)
							)
					}</li>}

				{typeof group.requirements.userGroups !== "undefined"
					&& group.requirements.userGroups.length > 1
					&& <li key="userGroups">{
						this.t("userPyramids.groupRequirements.memberOfUserGroups")
							.replace("{0}",
								group.requirements.userGroups
									.map(gn => this.t(`userGroup.${gn}`))
									.join(", "))
					}</li>}

				{typeof group.requirements.totalEditsAtLeast === "number"
					&& <li key="totalEditsAtLeast.simple">{
						this.t("userPyramids.groupRequirements.totalEditsAtLeast.simple")
							.replace("{0}", group.requirements.totalEditsAtLeast.toString())
					}</li>}

				{typeof group.requirements.totalEditsAtLeast !== "undefined"
					&& typeof group.requirements.totalEditsAtLeast !== "number"
					&& <li key="totalEditsAtLeast.withEpoch">{
						this.t("userPyramids.groupRequirements.totalEditsAtLeast.withEpoch")
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
						this.t("userPyramids.groupRequirements.totalEditsAtMost.withEpoch")
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
		const { pyramid } = this.getWikiPyramidsAndSelectedPyramid();

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
					setValue={this.setSelectedWiki}
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
				{this.userPyramidSeries.length >= 10 && <div className={userPyramidsStyles.maxNumberOfSeriesReached}>
					{this.t("userPyramids.maxNumberOfSeriesReached")}
				</div>}
				{pyramid
					&& pyramid.isTimeless
					&& <InlineCallout
						icon={<Icon iconSize={14} icon="info-sign" />}>
						{this.t("userPyramids.timelessSeries")}
					</InlineCallout>}
			</ParameterGroup>
			<ParameterGroup title={this.t("userPyramids.displaySettings")}>
				<Switch
					checked={this.logScaleGraph}
					onChange={(ev) => this.logScaleGraph = ev.currentTarget.checked}
					label={this.t("userPyramids.logScaleGraph")} />
			</ParameterGroup>
		</ParameterBox>;
	}

	private renderExistingSeries(): React.ReactNode {
		if (this.userPyramidSeries.length === 0) {
			return <InlineCallout
				icon={<Icon iconSize={14} icon="info-sign" />}>
				{this.t("userPyramids.noSeriesAdded")}
			</InlineCallout>;
		}

		return this.userPyramidSeries.map(series => <div key={format(series.date, "yyyy-MM-dd")}
			className={userPyramidsStyles.visibleSeries}>
			{moment(series.date).format("LL")}
			{series.isLoading
				&& <Spinner size={16} />}
			{series.failedToLoad
				&& <>
					<span className={userPyramidsStyles.seriesFailedToLoad}>
						{this.t("userPyramids.seriesFailedToLoad")}
					</span>
					<Tooltip content={this.t("userPyramids.series.retry")}>
						<AnchorButton
							icon="refresh"
							small
							intent={Intent.WARNING}
							minimal
							onClick={() => this.loadSeries(series)} />
					</Tooltip>
				</>}
			<Tooltip content={this.t("userPyramids.series.delete")}>
				<AnchorButton
					icon="cross"
					small
					intent={Intent.DANGER}
					minimal
					onClick={this.deleteSeries(series)} />
			</Tooltip>
		</div>);
	}

	private renderAddSeriesControls(): React.ReactNode {
		const { pyramid } = this.getWikiPyramidsAndSelectedPyramid();

		return <>
			<DateInput
				value={this.newUserPyramidSeries.date}
				setValue={this.setNewPyramidDate}
				localizationProvider={this.getDateInputLocalizationProvider()}
				minDate={pyramid?.isTimeless === true ? today : undefined}
				maxDate={today}
				disabled={!this.isProperPyramidSelected}
			/>

			<Button icon="plus" intent={Intent.PRIMARY} minimal outlined
				onClick={this.addSeries}
				disabled={this.isAddPyramidSeriesDisabled}
				text={this.t("button.add")} />
		</>;
	}

	private setSelectedWiki = (selectedWiki: SelectableValue) => {
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
		this.setSelectedWiki(this.selectableWikis[0]);
	}

	private setSelectedUserPyramid = (selectedUserPyramid: SelectableValue) => {
		this.selectedUserPyramid = selectedUserPyramid;

		const { pyramid } = this.getWikiPyramidsAndSelectedPyramid();
		if (pyramid?.isTimeless) {
			this.newUserPyramidSeries.date = today;
		}
	}

	private setNewPyramidDate = (date: Date) => {
		this.newUserPyramidSeries.date = date;
	}

	private addSeries = async (): Promise<void> => {
		const newlyAddedSeries = this.newUserPyramidSeries;
		this.userPyramidSeries.push(newlyAddedSeries);
		this.newUserPyramidSeries = new UserPyramidSeries();
		this.newUserPyramidSeries.date = moment(newlyAddedSeries.date).toDate();

		this.loadSeries(newlyAddedSeries);
	}

	private loadSeries = async (series: UserPyramidSeries): Promise<void> => {
		series.isLoading = true;
		series.failedToLoad = false;

		try {
			const resp = await Axios.get(
				"/api/userPyramids/seriesData?"
				+ `wikiId=${this.selectedWiki.id}`
				+ `&pyramidId=${this.selectedUserPyramid.id}`
				+ `&date=${format(series.date, "yyyy-MM-dd")}`,
				{ timeout: 100000 }
			);

			if (resp.status === 200) {
				series.data = resp.data;
			} else {
				series.failedToLoad = true;
			}
			series.isLoading = false;
		}
		catch (err) {
			series.failedToLoad = true;
			series.isLoading = false;
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

	private getWikiPyramidsAndSelectedPyramid() {
		const wikiPyramids = this.selectedWiki
			? this.props.userPyramids.find(x => x.wiki === this.selectedWiki.id)
			: null;
		const pyramid = wikiPyramids && wikiPyramids.valid && this.selectedUserPyramid
			? wikiPyramids.userPyramids.find(x => x.id === this.selectedUserPyramid.id)
			: null;

		return {
			wikiPyramids: wikiPyramids,
			pyramid: pyramid
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
