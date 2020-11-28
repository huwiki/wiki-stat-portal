import { Position, Tooltip } from "@blueprintjs/core";
import * as classnames from "classnames";
import * as React from "react";
import pyramidVisualizationStyles from "./pyramidVisualization.module.scss";

interface IPyramidSeriesValue {
	value: number;
	commonWithPreviousGroup: number;
}

interface IPyramidGroup {
	id: string;
	description: string;
	tooltip: JSX.Element | string;
	seriesValues: IPyramidSeriesValue[];
}

interface ISeriesVisualizationInfo {
	uniqueId: string;
	colorClass: string;
	populationSize: number;
	populationPercentage: number;
	populationDisplayPercentage: number
	populationDisplayPercentageLog10: number
	commonWithPreviousGroup: number;
	commonWithPreviousPercentage: number;
	commonWithPreviousDisplayPercentage: number;
	commonWithPreviousDisplayPercentageLog10: number;
}

interface IPyramidVisualizationProps {
	title: string;
	seriesDescriptions: string[];
	showIntersectionWithPreviousGroup: boolean;
	logScaleGraph: boolean;
	groups: IPyramidGroup[];
	translatorFunction: (string: string) => string;
	locale: string;
}


export class PyramidVisualization extends React.Component<IPyramidVisualizationProps> {
	private t = (key: string) => this.props.translatorFunction(key);
	private numberFormatter: Intl.NumberFormat;
	private percentageFormatter: Intl.NumberFormat;

	constructor(props: IPyramidVisualizationProps) {
		super(props);

		this.numberFormatter = new Intl.NumberFormat(props.locale, {
			style: "decimal",
			maximumFractionDigits: 0
		});
		this.percentageFormatter = new Intl.NumberFormat(props.locale, {
			style: "percent",
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	public render(): JSX.Element {
		const maxGroupSize = this.getMaxGroupSize();
		const firstGroupValues = this.props.groups[0].seriesValues;

		return <>
			<div className={pyramidVisualizationStyles.titleBar}>
				<div className={pyramidVisualizationStyles.pyramidTitle}>{this.props.title}</div>
				{this.renderSeriesDescriptions()}
			</div>
			<div className={pyramidVisualizationStyles.table}>
				{this.renderHeaderRow()}
				{this.props.groups.map((group, index) => this.renderPyramidGroup(group, maxGroupSize, firstGroupValues, index === 0))}
			</div>
		</>;
	}

	private getMaxGroupSize(): number {
		let maxGroupSize = 0;
		for (const group of this.props.groups) {
			for (const seriesValue of group.seriesValues) {
				if (seriesValue.value > maxGroupSize)
					maxGroupSize = seriesValue.value;
			}
		}

		return maxGroupSize;
	}

	private renderSeriesDescriptions(): JSX.Element {
		let counter: number = 0;

		return <>
			{this.t("userPyramids.seriesLabels")}
			{this.props.seriesDescriptions.map(x => {
				counter++;
				const key = `group-${counter}`;
				const colorClass = classnames(pyramidVisualizationStyles.seriesDescriptionBox, this.getColorClass(counter));

				return <div key={key} className={pyramidVisualizationStyles.seriesDescription}>
					<div className={colorClass} />
					{x}
				</div>;
			})}
		</>;
	}

	private renderHeaderRow() {
		return <div className={pyramidVisualizationStyles.tableHeaderRow}>
			<div className={pyramidVisualizationStyles.groupLabel}>
				{this.t("userPyramids.header.group")}
			</div>
			<div className={pyramidVisualizationStyles.bars} />
			<div className={pyramidVisualizationStyles.populationSize}>
				{this.t("userPyramids.header.numberOfEditors")}
			</div>
			<div className={pyramidVisualizationStyles.populationSize}>
				{this.t("userPyramids.header.percentage")}
			</div>
			{this.props.showIntersectionWithPreviousGroup
				&& <>
					<div className={pyramidVisualizationStyles.populationSize}>
						{this.t("userPyramids.header.intersectionWithPreviousGroup")}
					</div>
					<div className={pyramidVisualizationStyles.populationSize}>
						{this.t("userPyramids.header.intersectionPercentage")}
					</div>
				</>}
		</div>;
	}

	private renderPyramidGroup(group: IPyramidGroup, maxGroupSize: number, firstGroupValues: IPyramidSeriesValue[], isFirst: boolean) {
		let counter: number = 0;

		const maxGroupSizeLog10 = maxGroupSize > 0
			? Math.log10(maxGroupSize)
			: 0;

		const seriesValues: ISeriesVisualizationInfo[] = group.seriesValues.map(sv => ({
			uniqueId: `value-${counter++}`,
			colorClass: this.getColorClass(counter),
			populationSize: sv.value,
			populationPercentage: firstGroupValues[0].value > 0
				? sv.value / firstGroupValues[0].value
				: 0,
			populationDisplayPercentage: maxGroupSize > 0
				? (sv.value / maxGroupSize) * 100
				: 0,
			populationDisplayPercentageLog10: maxGroupSize > 0
				? (Math.log10(sv.value) / maxGroupSizeLog10) * 100
				: 0,
			commonWithPreviousGroup: sv.commonWithPreviousGroup,
			commonWithPreviousPercentage: sv.value > 0
				? sv.commonWithPreviousGroup / sv.value
				: 0,
			commonWithPreviousDisplayPercentage: sv.value > 0
				? (sv.commonWithPreviousGroup / maxGroupSize) * 100
				: 0,
			commonWithPreviousDisplayPercentageLog10: sv.value > 0 && sv.commonWithPreviousGroup > 0
				? (Math.log10(sv.commonWithPreviousGroup) / maxGroupSizeLog10) * 100
				: 0,
		}));

		return <div key={group.id} className={pyramidVisualizationStyles.tableRow}>
			<div className={pyramidVisualizationStyles.groupLabel}>
				{group.tooltip
					? <Tooltip position={Position.BOTTOM_LEFT} content={group.tooltip}>{group.description}</Tooltip>
					: group.description}
			</div>
			<div className={pyramidVisualizationStyles.bars}>
				{this.renderBars(seriesValues)}
			</div>
			<div className={pyramidVisualizationStyles.populationSize}>
				{seriesValues.map(seriesValue => <div
					key={seriesValue.uniqueId}
					className={classnames(pyramidVisualizationStyles.populationSizeEntry, seriesValue.colorClass)}
				>
					{this.numberFormatter.format(seriesValue.populationSize)}
				</div>)}
			</div>
			<div className={pyramidVisualizationStyles.populationSize}>
				{seriesValues.map(seriesValue => <div
					key={seriesValue.uniqueId}
					className={classnames(pyramidVisualizationStyles.populationSizeEntry, seriesValue.colorClass)}
				>
					{this.percentageFormatter.format(seriesValue.populationPercentage)}
				</div>)}
			</div>
			{this.props.showIntersectionWithPreviousGroup
				&& <>
					<div className={pyramidVisualizationStyles.populationSizePrev}>
						{seriesValues.map(seriesValue => <div
							key={seriesValue.uniqueId}
							className={classnames(pyramidVisualizationStyles.populationSizePrevEntry, seriesValue.colorClass)}
						>
							{isFirst
								? "–"
								: this.numberFormatter.format(seriesValue.commonWithPreviousGroup)}
						</div>)}
					</div>
					<div className={pyramidVisualizationStyles.populationSizePrev}>
						{seriesValues.map(seriesValue => <div
							key={seriesValue.uniqueId}
							className={classnames(pyramidVisualizationStyles.populationSizePrevEntry, seriesValue.colorClass)}
						>
							{isFirst
								? "–"
								: this.percentageFormatter.format(seriesValue.commonWithPreviousPercentage)}
						</div>)}
					</div>
				</>}
		</div >;
	}

	private renderBars(seriesValues: ISeriesVisualizationInfo[]): React.ReactNode {
		return seriesValues.map(seriesValue => this.renderBar(seriesValue));
	}

	private renderBar(seriesValue: ISeriesVisualizationInfo): JSX.Element {
		const normalBarWidth = this.props.logScaleGraph
			? seriesValue.populationDisplayPercentageLog10.toFixed(2)
			: seriesValue.populationDisplayPercentage.toFixed(2);
		const commonBarWidth = this.props.logScaleGraph
			? seriesValue.commonWithPreviousDisplayPercentageLog10.toFixed(2)
			: seriesValue.commonWithPreviousDisplayPercentage.toFixed(2);

		return <div key={seriesValue.uniqueId}
			className={classnames(pyramidVisualizationStyles.barWrapper, seriesValue.colorClass)}>
			<div className={pyramidVisualizationStyles.bar}
				style={{ width: `${normalBarWidth}%` }}>
			</div>
			{seriesValue.commonWithPreviousGroup > 0
				&& this.props.showIntersectionWithPreviousGroup
				&& <div className={pyramidVisualizationStyles.commonPartBar}
					style={{ width: `${commonBarWidth}%` }} />}
		</div>;
	}

	private getColorClass(index: number) {
		switch (index % 10) {
			case 0: {
				return pyramidVisualizationStyles.yellow;
			}
			case 1: {
				return pyramidVisualizationStyles.green;
			}
			case 2: {
				return pyramidVisualizationStyles.blue;
			}
			case 3: {
				return pyramidVisualizationStyles.red;
			}
			case 4: {
				return pyramidVisualizationStyles.orange;
			}
			case 5: {
				return pyramidVisualizationStyles.purple;
			}
			case 6: {
				return pyramidVisualizationStyles.cyan;
			}
			case 7: {
				return pyramidVisualizationStyles.olive;
			}
			case 8: {
				return pyramidVisualizationStyles.slategray;
			}
			default: {
				return pyramidVisualizationStyles.magenta;
			}
		}
	}
}
