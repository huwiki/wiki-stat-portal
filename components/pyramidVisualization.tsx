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
	commonWithPreviousGroup: number;
	commonWithPreviousPercentage: number;
}

interface IPyramidVisualizationProps {
	title: string;
	seriesDescriptions: string[];
	groups: IPyramidGroup[];
	translatorFunction: (string: string) => string;
}


export class PyramidVisualization extends React.Component<IPyramidVisualizationProps> {
	private t = (key: string) => this.props.translatorFunction(key);

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
			<div className={pyramidVisualizationStyles.populationSize}>
				{this.t("userPyramids.header.intersectionWithPreviousGroup")}
			</div>
			<div className={pyramidVisualizationStyles.populationSize}>
				{this.t("userPyramids.header.intersectionPercentage")}
			</div>
		</div>;
	}

	private renderPyramidGroup(group: IPyramidGroup, maxGroupSize: number, firstGroupValues: IPyramidSeriesValue[], isFirst: boolean) {
		let counter: number = 0;
		const seriesValues: ISeriesVisualizationInfo[] = group.seriesValues.map(sv => ({
			uniqueId: `value-${counter++}`,
			colorClass: this.getColorClass(counter),
			populationSize: sv.value,
			populationPercentage: firstGroupValues[0].value > 0
				? (sv.value / firstGroupValues[0].value) * 100
				: 0,
			populationDisplayPercentage: maxGroupSize > 0
				? (sv.value / maxGroupSize) * 100
				: 0,
			commonWithPreviousGroup: sv.commonWithPreviousGroup,
			commonWithPreviousPercentage: sv.value > 0
				? (sv.commonWithPreviousGroup / sv.value) * 100
				: 0
		}));

		return <div key={group.id} className={pyramidVisualizationStyles.tableRow}>
			<div className={pyramidVisualizationStyles.groupLabel}>
				{group.tooltip
					? <Tooltip position={Position.BOTTOM_LEFT} content={group.tooltip}>{group.description}</Tooltip>
					: group.description}
			</div>
			<div className={pyramidVisualizationStyles.bars}>
				{seriesValues.map(seriesValue =>
					<div key={seriesValue.uniqueId}
						className={classnames(pyramidVisualizationStyles.barWrapper, seriesValue.colorClass)}>
						<div className={pyramidVisualizationStyles.bar}
							style={{ width: `${seriesValue.populationDisplayPercentage.toFixed(2)}%` }}>
							{seriesValue.commonWithPreviousGroup > 0 &&
								<div className={pyramidVisualizationStyles.commonPartBar}
									style={{ width: `${seriesValue.commonWithPreviousPercentage.toFixed(2)}%` }} />}
						</div>
					</div>)}
			</div>
			<div className={pyramidVisualizationStyles.populationSize}>
				{seriesValues.map(seriesValue => <div
					key={seriesValue.uniqueId}
					className={classnames(pyramidVisualizationStyles.populationSizeEntry, seriesValue.colorClass)}
				>
					{seriesValue.populationSize}
				</div>)}
			</div>
			<div className={pyramidVisualizationStyles.populationSize}>
				{seriesValues.map(seriesValue => <div
					key={seriesValue.uniqueId}
					className={classnames(pyramidVisualizationStyles.populationSizeEntry, seriesValue.colorClass)}
				>
					{seriesValue.populationPercentage.toFixed(2)}%
				</div>)}
			</div>
			<div className={pyramidVisualizationStyles.populationSizePrev}>
				{seriesValues.map(seriesValue => <div
					key={seriesValue.uniqueId}
					className={classnames(pyramidVisualizationStyles.populationSizePrevEntry, seriesValue.colorClass)}
				>
					{isFirst
						? "–"
						: seriesValue.commonWithPreviousGroup}
				</div>)}
			</div>
			<div className={pyramidVisualizationStyles.populationSizePrev}>
				{seriesValues.map(seriesValue => <div
					key={seriesValue.uniqueId}
					className={classnames(pyramidVisualizationStyles.populationSizePrevEntry, seriesValue.colorClass)}
				>
					{isFirst
						? "–"
						: seriesValue.commonWithPreviousPercentage.toFixed(2) + "%"}
				</div>)}
			</div>
		</div >;
	}

	private getColorClass(index: number) {
		switch (index % 6) {
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
			default: {
				return pyramidVisualizationStyles.purple;
			}
		}
	}
}
