import * as React from "react";
import parameterBoxStyles from "./parameterBox.module.scss";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IParameterBoxProps {
}

export class ParameterBox extends React.Component<IParameterBoxProps> {
	public render(): JSX.Element {
		return <div className={parameterBoxStyles.parameterBox}>
			{this.props.children}
		</div>;
	}
}
