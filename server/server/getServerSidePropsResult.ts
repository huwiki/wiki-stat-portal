import { CommonPageProps } from "../../common/interfaces/commonPageProps";

export interface GetServerSidePropsResult<T extends CommonPageProps> {
	props: Partial<T>;
}
