import * as _ from "lodash";
import * as React from "react";
import pyramidVisualizationStyles from "./pyramidVisualization.module.scss";

interface IPyramidGroup {
	description: string;
	seriesValues: number[];
}

interface IPyramidVisualizationProps {
	title: string;
	seriesDescriptions: string[];
	groups: IPyramidGroup[];
}

const seriesColors: string[] = [
	"rgb(87, 194, 110)", // green
	"rgb(192, 194, 87)", // yellow
	"rgb(194, 87, 87)", // red
	"rgb(87, 121, 194)", // blue
	"rgb(194, 157, 87)", // orange
	"rgb(151, 87, 194)", // purple
];

interface ISeriesVisualizationInfo {
	uniqueId: string;
	color: string;
	populationSize: number;
	populationPercentage: number;
}

export class PyramidVisualization extends React.Component<IPyramidVisualizationProps> {
	public render(): JSX.Element {
		const groupWithLargestPopulation = _.maxBy(this.props.groups, ele => _.maxBy(ele.seriesValues, seriesValue => seriesValue));
		const maxGroupSize = _.maxBy(groupWithLargestPopulation?.seriesValues ?? [])
			?? 0;

		return <>
			<div className={pyramidVisualizationStyles.titleBar}>
				<div className={pyramidVisualizationStyles.pyramidTitle}>{this.props.title}</div>
				{this.renderSeriesDescriptions()}
			</div>
			<div className={pyramidVisualizationStyles.table}>
				{this.renderHeaderRow()}
				{this.props.groups.map(group => this.renderPyramidGroup(group, maxGroupSize))}
			</div>
		</>;
	}

	private renderSeriesDescriptions(): JSX.Element {
		let counter: number = 0;

		return <>
			{this.props.seriesDescriptions.map(x => {
				counter++;
				const color = seriesColors[counter % seriesColors.length];

				return <div key={`group-${counter}`} className={pyramidVisualizationStyles.seriesDescription}>
					<div className={pyramidVisualizationStyles.seriesDescriptionBox} style={{
						backgroundColor: color
					}}></div>
					{x}
				</div>;
			})}
		</>;
	}

	private renderHeaderRow() {
		return <div className={pyramidVisualizationStyles.tableHeaderRow}>
			<div className={pyramidVisualizationStyles.groupLabel}>
				Csoport
			</div>
			<div className={pyramidVisualizationStyles.bars}>
				Csoport
			</div>
			<div className={pyramidVisualizationStyles.populationSize}>
				Szerkesztők száma
			</div>
			<div className={pyramidVisualizationStyles.populationSize}>
				Százalékos arány
			</div>
		</div>;
	}

	private renderPyramidGroup(group: IPyramidGroup, maxGroupSize: number) {
		let counter: number = 0;
		const seriesValues: ISeriesVisualizationInfo[] = group.seriesValues.map(sv => ({
			uniqueId: `value-${counter++}`,
			color: seriesColors[counter % seriesColors.length],
			populationSize: sv,
			populationPercentage: (sv / maxGroupSize) * 100
		}));

		return <div className={pyramidVisualizationStyles.tableRow}>
			<div className={pyramidVisualizationStyles.groupLabel}>{group.description}</div>
			<div className={pyramidVisualizationStyles.bars}>
				{seriesValues.map(seriesValue => <div
					key={seriesValue.uniqueId}
					className={pyramidVisualizationStyles.bar}
					style={{
						backgroundColor: seriesValue.color,
						width: `${seriesValue.populationPercentage.toFixed(2)}%`
					}}
				></div>)}
			</div>
			<div className={pyramidVisualizationStyles.populationSize}>
				{seriesValues.map(seriesValue => <div
					key={seriesValue[0]}
					className={pyramidVisualizationStyles.populationSizeEntry}
				>
					{seriesValue.populationSize}
				</div>)}
			</div>
			<div className={pyramidVisualizationStyles.populationSizePercentage}>
				{seriesValues.map(seriesValue => <div
					key={seriesValue[0]}
					className={pyramidVisualizationStyles.populationSizeEntry}
				>
					{seriesValue.populationPercentage.toFixed(2)}%
				</div>)}
			</div>
		</div >;
	}
}
