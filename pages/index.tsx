import { Button, Card, Icon } from "@blueprintjs/core";
import { NextPageContext } from "next";
import { withRouter } from "next/router";
import * as React from "react";
import { PageFrame } from "../components/pageFrame";
import { CommonPageProps, ModuleDescriptor } from "../helpers/client/commonPageProps";
import { NextBasePage } from "../helpers/client/nextBasePage";
import { withCommonServerSideProps } from "../helpers/server/serverSidePageHelpers";
import { GetServerSidePropsResult } from "../interfaces/server/getServerSidePropsResult";
import indexPageStyles from "../styles/indexPage.module.scss";

const REQUIRED_LANGUAGE_GROUPS = [
	"common",
	"indexPage"
];

class IndexPage extends NextBasePage<CommonPageProps> {
	public render(): JSX.Element {
		return <PageFrame
			icon="application"
			title={this.t("indexPage", "title")}
			router={this.props.router}
			i18nProvider={this.i18nProvider}>
			<p>{this.t("indexPage", "description")}</p>
			<div className={indexPageStyles.moduleCardList}>
				{this.props.availableModules.map(x => this.renderModuleDetails(x))}
			</div>
		</PageFrame>;
	}

	private renderModuleDetails(module: ModuleDescriptor) {
		return <Card className="moduleCard" key={module.id}>
			<Icon className="moduleCardIcon" icon={module.icon} iconSize={96} />
			<h3>{this.t("common", `module.${module.id}`)}</h3>
			<p>{this.t("common", `module.${module.id}.description`)}</p>
			<Button text={this.t("common", "button.go")} rightIcon="caret-right" onClick={this.goToModulePage(module.id)} />
		</Card>;
	}

	private goToModulePage(moduleId: string) {
		return () => {
			this.props.router.push(`/modules/${moduleId}`);
		};
	}

}

export const getServerSideProps = async (ctx: NextPageContext): Promise<GetServerSidePropsResult<CommonPageProps>> => {
	return await withCommonServerSideProps<CommonPageProps>(ctx, {}, REQUIRED_LANGUAGE_GROUPS);
};

export default withRouter(IndexPage);
