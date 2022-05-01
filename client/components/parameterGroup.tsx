import * as React from "react";
import parameterGroupStyles from "./parameterGroup.module.scss";

interface IParameterGroupProps {
	title?: string;
}

export class ParameterGroup extends React.Component<IParameterGroupProps> {
	public render(): JSX.Element {
		return <div className={parameterGroupStyles.parameterGroup}>
			{this.props.title && <div className={parameterGroupStyles.parameterGroupTitle}>
				{this.props.title}
			</div>}
			<div className={parameterGroupStyles.parameterGroupParameters}>
				{this.props.children}
			</div>
		</div>;
	}
}
