import { Button, Classes, NumericInput, Popover } from "@blueprintjs/core";
import { configure, makeObservable, observable } from "mobx";
import { observer } from "mobx-react";
import moment from "moment";
import * as React from "react";
import { DateInput, DateInputLocaliztaionProvider } from "./inputs/dateInput";
import styles from "./monthYearIntervalSelector.module.scss";

configure({
	enforceActions: "never",
});

const today = moment().startOf("day").toDate();

interface MonthYearIntervalSelectorProps {
	translate: (key: string) => string;
	fromDate: Date;
	onFromDateChange: (newValue: Date) => void;
	toDate: Date;
	onToDateChange: (newValue: Date) => void;
	localizationProvider?: DateInputLocaliztaionProvider;
	disabled: boolean;
}

@observer
export class MonthYearIntervalSelector extends React.Component<MonthYearIntervalSelectorProps> {
	public selectedYear: number = today.getFullYear();

	constructor(props: MonthYearIntervalSelectorProps) {
		super(props);

		makeObservable(this, {
			selectedYear: observable
		});
	}

	public render(): JSX.Element {
		return <div className={styles.intervalInput}>
			<DateInput
				value={this.props.fromDate}
				setValue={this.props.onFromDateChange}
				localizationProvider={this.props.localizationProvider}
				disabled={this.props.disabled}
			/>
			&nbsp;
			{"–"}
			&nbsp;
			<DateInput
				value={this.props.toDate}
				setValue={this.props.onToDateChange}
				localizationProvider={this.props.localizationProvider}
				disabled={this.props.disabled}
			/>
			<Popover content={this.renderQuickDateRangeSelector()}
				position="bottom">
				<Button icon="lightning"></Button>
			</Popover>
		</div>;
	}

	private renderQuickDateRangeSelector(): JSX.Element {
		const { translate } = this.props;

		return <div className={styles.popoverContent}>
			<div className={styles.yearInputRow}>
				<div className={styles.label}>Év:</div>
				<NumericInput
					min={2004}
					max={today.getFullYear()}
					value={this.selectedYear}
					onValueChange={(newValue) => {
						this.selectedYear = newValue;
					}}
				/>
			</div>
			<div className={styles.yearRangeSelectors}>
				{["fullYear", "firstHalf", "secondHalf", "q1", "q2", "q3", "q4", "twoYears", "fiveYears", "tenYears"].map(range => <Button
					className={Classes.POPOVER_DISMISS}
					key={range}
					text={translate(`input.subYearRange.${range}`)}
					onClick={() => this.setDateRange(range)}
				/>)}
			</div>
		</div>;
	}

	private setDateRange(range: string): void {
		const fromDate = moment().year(this.selectedYear);
		const toDate = moment().year(this.selectedYear);

		switch (range) {
			case "fullYear":
				fromDate.month(0).date(1);
				toDate.month(11).date(31);
				break;
			case "firstHalf":
				fromDate.month(0).date(1);
				toDate.month(5).date(30);
				break;
			case "secondHalf":
				fromDate.month(6).date(1);
				toDate.month(11).date(31);
				break;
			case "q1":
				fromDate.month(0).date(1);
				toDate.month(2).date(31);
				break;
			case "q2":
				fromDate.month(3).date(1);
				toDate.month(5).date(30);
				break;
			case "q3":
				fromDate.month(6).date(1);
				toDate.month(8).date(30);
				break;
			case "q4":
				fromDate.month(9).date(1);
				toDate.month(11).date(31);
				break;
			case "twoYears":
				fromDate.year(fromDate.year() - 1).month(0).date(1);
				toDate.month(11).date(31);
				break;
			case "fiveYears":
				fromDate.year(fromDate.year() - 4).month(0).date(1);
				toDate.month(11).date(31);
				break;
			case "tenYears":
				fromDate.year(fromDate.year() - 9).month(0).date(1);
				toDate.month(11).date(31);
				break;
		}

		this.props.onFromDateChange(fromDate.toDate());
		this.props.onToDateChange(toDate.toDate());
	}
}
