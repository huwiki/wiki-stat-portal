import { stringify } from "csv-stringify/dist/umd/sync";
import moment from "moment";
import { GroupActor } from "../../common/interfaces/statisticsQueryModels";
import { ListColumn, ListConfiguration } from "../../common/modules/lists/listsConfiguration";
import { ListDataActorEntry, ListDataGroupEntry, ListDataResult } from "../../pages/api/lists/listData";
import { CellDataTypes, LIST_COLUMN_DATATYPE_MAP } from "./listColumnDataTypes";


export const generateCsvFromListData = (
	data: ListDataResult,
	columns: ListColumn[],
	translate: (key: string) => string
): string => {
	const result: unknown[][] = [];

	const percentFormatter = Intl.NumberFormat("en-US", {
		style: "percent",
		maximumFractionDigits: 2,
		minimumFractionDigits: 0,
	});

	result.push(columns.filter(column => column.isHidden !== true).map((column) => {
		return column.headerI18nKey ? translate(column.headerI18nKey) : column.type;
	}));

	for (const row of data.results) {
		const columnData = getRowColumnData(data.list, row);

		result.push(columnData.map((rowData, idx) => {
			const columnDefinition = columns[idx];
			if (columnDefinition.isHidden)
				return null;

			const dataType: CellDataTypes | undefined = Object.prototype.hasOwnProperty.call(LIST_COLUMN_DATATYPE_MAP, columnDefinition.type)
				? LIST_COLUMN_DATATYPE_MAP[columnDefinition.type]
				: "other";

			if (columnDefinition.type === "counter") {
				return typeof rowData === "number" ? `${rowData}.` : "";
			}

			if (columnDefinition.type === "userName") {
				return rowData;
			}

			if (columnDefinition.type === "userNames") {
				const userList = rowData as GroupActor[];
				return userList.map(x => x.name).join(";");
			}

			if (columnDefinition.type === "userGroups") {
				return convertUserGroupsToString(rowData, translate);
			}

			if (columnDefinition.type === "levelAtPeriodStart"
				|| columnDefinition.type === "levelAtPeriodEnd") {
				if (!rowData) {
					return "–";
				}

				return rowData[1];
			}

			if (columnDefinition.type === "levelAtPeriodEndWithChange") {
				if (!rowData) {
					return "–";
				}

				return (rowData[2] ? "🔺" : "") + rowData[1];
			}

			if (typeof rowData === "number") {
				if (dataType === "integer") {
					return rowData.toFixed(0);
				} else if (dataType === "percentage") {
					return percentFormatter.format(rowData);
				} else if (dataType === "float") {
					return rowData.toFixed(2);
				} else {
					return `${columnDefinition.type}, ${dataType}: ${rowData}`;
				}
			}

			if (typeof rowData === "string") {
				return rowData;
			}

			if (Array.isArray(rowData) && rowData.length === 3) {
				if (rowData[0] === 1900) {
					return "–";
				} else {
					return moment.utc(rowData).format("YYYY-MM-DD");
				}
			}

			if (rowData != null) {
				return `${typeof rowData}: ${rowData}`;
			}

			return "–";
		}).filter(x => x != null));
	}

	return stringify(result);
};

export const generateWikitextFromListData = (
	data: ListDataResult,
	columns: ListColumn[],
	translate: (key: string) => string,
	locale: string
): string => {
	const intFormatter = Intl.NumberFormat(locale, {
		maximumFractionDigits: 0,
		minimumFractionDigits: 0,
	});

	const floatFormatter = Intl.NumberFormat(locale, {
		maximumFractionDigits: 2,
		minimumFractionDigits: 0,
	});

	const percentFormatter = Intl.NumberFormat(locale, {
		style: "percent",
		maximumFractionDigits: 2,
		minimumFractionDigits: 0,
	});

	let result = "{| class=\"sortable wikitable\"\n";

	result += "!" + columns.filter(column => column.isHidden !== true).map((column) => {
		return column.headerI18nKey ? translate(column.headerI18nKey) : column.type;
	}).join(" !! ") + "\n";

	for (const row of data.results) {
		result += "|-\n| ";
		const columnData = getRowColumnData(data.list, row);

		result += columnData.map((rowData, idx) => {
			const columnDefinition = columns[idx];
			if (columnDefinition.isHidden)
				return null;

			const dataType: CellDataTypes | undefined = Object.prototype.hasOwnProperty.call(LIST_COLUMN_DATATYPE_MAP, columnDefinition.type)
				? LIST_COLUMN_DATATYPE_MAP[columnDefinition.type]
				: "other";

			if (columnDefinition.type === "counter") {
				return typeof rowData === "number" ? `${rowData}.` : "";
			}

			if (columnDefinition.type === "userName") {
				return `{{User2|${rowData}}}`;
			}

			if (columnDefinition.type === "userNames") {
				const userList = rowData as GroupActor[];
				return userList.map(x => `[[User:${x.name}|${x.name}]]`).join(", ");
			}

			if (columnDefinition.type === "userGroups") {
				return `<small>${convertUserGroupsToString(rowData, translate)}</small>`;
			}

			if (columnDefinition.type === "levelAtPeriodStart"
				|| columnDefinition.type === "levelAtPeriodEnd") {
				if (!rowData) {
					return "–";
				}

				return rowData[1];
			}

			if (columnDefinition.type === "levelAtPeriodEndWithChange") {
				if (!rowData) {
					return "–";
				}

				return (rowData[2] ? "{{Szintlépés}}" : "") + rowData[1];
			}

			if (typeof rowData === "number") {
				if (dataType === "integer") {
					return intFormatter.format(rowData);
				} else if (dataType === "percentage") {
					return percentFormatter.format(rowData);
				} else if (dataType === "float") {
					return floatFormatter.format(rowData);
				} else {
					return `${columnDefinition.type}, ${dataType}: ${rowData}`;
				}
			}

			if (typeof rowData === "string") {
				return rowData;
			}

			if (Array.isArray(rowData) && rowData.length === 3) {
				if (rowData[0] === 1900) {
					return "–";
				} else {
					return moment.utc(rowData).format("YYYY-MM-DD");
				}
			}

			if (rowData != null) {
				return `${typeof rowData}: ${rowData}`;
			}

			return "–";
		}).filter(x => x != null).join(" || ") + "\n";
	}

	result += "|}\n";

	return result;
};

export const convertUserGroupsToString = (groups: string[], translate: (key: string) => string): string => {
	if (!groups || Array.isArray(groups) === false)
		return "";

	const groupsLocalized = groups.map(group => translate(`userGroup.${group}.member`));
	return groupsLocalized.join(", ");
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRowColumnData(list: ListConfiguration, row: ListDataGroupEntry | ListDataActorEntry): any[] {
	let columnData;
	if (list.groupBy && list.groupBy.length > 0) {
		const groupRow = row as ListDataGroupEntry;
		columnData = [...groupRow.data, groupRow.users];
	} else {
		const actorRow = row as ListDataActorEntry;
		columnData = actorRow.columnData;
	}
	return columnData;
}

