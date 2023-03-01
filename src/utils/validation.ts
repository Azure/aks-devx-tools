// validations should sleep so error messages don't appear while user is typing
const validationSleep = async () => {
   await new Promise((resolve) => setTimeout(resolve, 250));
};

type Validator = (
   value: string
) => string | undefined | null | Thenable<string | undefined | null>;

const passingTestRet = undefined; // https://code.visualstudio.com/api/references/vscode-api#InputBoxOptions
export const ValidatePort: Validator = async (port: string) => {
   await validationSleep();

   const portNum = parseInt(port);
   const portMin = 1;
   const portMax = 65535;
   const portErr = `Port must be in range ${portMin} to ${portMax}`;

   if (Number.isNaN(portNum)) {
      return portErr;
   }
   if (portNum < portMin) {
      return portErr;
   }
   if (portNum > portMax) {
      return portErr;
   }

   return passingTestRet;
};

// RFC 1123 is a common spec for K8s resources. https://kubernetes.io/docs/concepts/overview/working-with-objects/names/
export const ValidateRfc1123: Validator = async (input: string) => {
   await validationSleep();

   const alphanumDash = /^[0-9a-z-]+$/;
   const maxLen = 63;

   if (!input.match(alphanumDash)) {
      return "Input must be lowercase alphanumeric plus '-'";
   }
   if (input.length > maxLen) {
      return `Input length must be less than ${maxLen}`;
   }
   if (input.charAt(0) === '-' || input.charAt(input.length - 1) === '-') {
      return 'Input must start and end with a lowercase alphanumeric character';
   }

   return passingTestRet;
};

export const ValidateImage: Validator = async (image: string) => {
   await validationSleep();

   // TODO: add validation
   const re =
      /^([\w.\-_]+((?::\d+|)(?=\/[a-z0-9._-]+\/[a-z0-9._-]+))|)(?:\/|)([a-z0-9.\-_]+(?:\/[a-z0-9.\-_]+|))$/;
   if (!image.match(re)) {
      return 'Image must be a valid image name';
   }

   return passingTestRet;
};
export const ValidateImageTag: Validator = async (image: string) => {
   await validationSleep();

   // TODO: add validation
   const re = /^(([\w.\-_]{1,127})|)$/;
   if (!image.match(re)) {
      return 'ImageTag must be a valid image tag';
   }

   // Separator rules from https://docs.docker.com/engine/reference/commandline/tag/
   const separators = ['.', '-', '--', '_', '__'];
   const startsWithSeparator = separators.some((sep) => image.startsWith(sep));
   const endsWithSeparator = separators.some((sep) => image.endsWith(sep));
   if (startsWithSeparator || endsWithSeparator) {
      return 'ImageTag must not start or end with a separator';
   }

   const invalidSeparators = ['..', '___'];
   const containsInvalidSeparator = invalidSeparators.some((sep) =>
      image.includes(sep)
   );
   if (containsInvalidSeparator) {
      return 'ImageTag must not contain invalid separators';
   }

   return passingTestRet;
};
