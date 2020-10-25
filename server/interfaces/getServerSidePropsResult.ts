import { CommonPageProps } from "../../client/helpers/commonPageProps";

export interface GetServerSidePropsResult<T extends CommonPageProps> {
	props: Partial<T>;
}
