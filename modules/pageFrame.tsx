import { Icon, IconName } from "@blueprintjs/core";
import * as React from "react";

interface PageFrameProps {
	title: string;
	icon: IconName;
	children?: React.ReactNode;
}

export const PageFrame = (props: PageFrameProps): JSX.Element => <>
	<h2>
		<Icon icon={props.icon} />
		{props.title}
	</h2>
	{props.children}
</>;
