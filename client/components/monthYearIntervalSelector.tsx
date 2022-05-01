import { configure, makeObservable, observable } from "mobx";
import { observer } from "mobx-react";
import moment from "moment";
import * as React from "react";
import { SelectInput } from "./inputs/selectInput";
import styles from "./monthYearIntervalSelector.module.scss";

configure({
	enforceActions: "never",
	// computedRequiresReaction: true,
	// reactionRequiresObservable: true,
	// observableRequiresReaction: true,
	// disableErrorBoundaries: true
});

class SelectableYear {
	constructor(public year: number) {
	}
}

const SELECTABLE_SUB_YEAR_RANGES: SelectableSubYearRangeValueType[] = [
	"fullYear", "firstHalf", "secondHalf", "q1", "q2", "q3", "q4"
];
export type SelectableSubYearRangeValueType = "fullYear" | "firstHalf" | "secondHalf" | "q1" | "q2" | "q3" | "q4" | number;

class SelectableSubYearRange {
	constructor(public subYear: SelectableSubYearRangeValueType) {
	}
}

interface MonthYearIntervalSelectorProps {
	translate: (key: string) => string;
	startYear: number;
	endYear: number;
	selectedYear: number;
	onSelectedYearChange: (newSelectedYear: number) => void;
	selectedSubYearRange: SelectableSubYearRangeValueType;
	onSelectedSubYearRangeChange: (selectedSubYearRange: SelectableSubYearRangeValueType) => void;
	disabled: boolean;
}

@observer
export class MonthYearIntervalSelector extends React.Component<MonthYearIntervalSelectorProps> {
	public availableYears: SelectableYear[] = [];
	public availableSubYearRanges: SelectableSubYearRange[] = [];

	constructor(props: MonthYearIntervalSelectorProps) {
		super(props);

		for (let i = props.startYear; i <= props.endYear; i++) {
			this.availableYears.push(new SelectableYear(i));
		}

		for (const subYearRange of SELECTABLE_SUB_YEAR_RANGES) {
			this.availableSubYearRanges.push(new SelectableSubYearRange(subYearRange));
		}
		for (let i = 1; i <= 12; i++) {
			this.availableSubYearRanges.push(new SelectableSubYearRange(i));
		}

		makeObservable(this, {
			availableYears: observable,
			availableSubYearRanges: observable
		});
	}

	public render(): JSX.Element {
		return <div className={styles.intervalInput}>
			<SelectInput<SelectableYear>
				inputClassName={styles.intervalInputYearSelector}
				inputLabel={this.props.translate("lists.year")}
				items={this.availableYears}
				value={this.availableYears.find(x => x.year === this.props.selectedYear)}
				setValue={(newValue) => {
					this.props.onSelectedYearChange(newValue.year);
				}}
				itemKeySelector={ele => ele.year.toString()}
				itemRenderer={this.renderYear}
				disabled={this.props.disabled}
				noSelectedItemsLabel={"NOPE"}

			/>
			<SelectInput<SelectableSubYearRange>
				inputClassName={styles.intervalInputMonthSelector}
				inputLabel={this.props.translate("lists.subYearRange")}
				items={this.availableSubYearRanges}
				value={this.availableSubYearRanges.find(x => x.subYear === this.props.selectedSubYearRange)}
				setValue={(newValue) => {
					this.props.onSelectedSubYearRangeChange(newValue.subYear);
				}}
				itemKeySelector={ele => ele.subYear.toString()}
				itemRenderer={this.renderMonth}
				disabled={this.props.disabled}
				noSelectedItemsLabel={"NOPE"}
			/>
		</div>;
	}

	private renderYear = (selectableYear: SelectableYear) => {
		return selectableYear.year.toString();
	}

	private renderMonth = (selectableSubYearRange: SelectableSubYearRange) => {
		return typeof selectableSubYearRange.subYear === "string"
			? this.props.translate(`input.subYearRange.${selectableSubYearRange.subYear}`)
			: moment().month(selectableSubYearRange.subYear - 1).format("MMMM");
	}
}
