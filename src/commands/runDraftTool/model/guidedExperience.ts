// used to keep track of which experiences have been completed for determining autodetect information
export interface CompletedSteps {
   draftDockerfile: boolean;
   buildOnAcr: boolean;
   draftDeployment: boolean;
}

export const noCompletedSteps = (): CompletedSteps => ({
   draftDockerfile: false,
   buildOnAcr: false,
   draftDeployment: false
});
