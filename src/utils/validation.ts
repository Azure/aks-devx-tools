// validations should sleep so error messages don't appear while user is typing
const validationSleep = async () => {
   await new Promise((resolve) => setTimeout(resolve, 250));
};

type Validator = (
   value: string
) => string | undefined | null | Thenable<string | undefined | null>;

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

   return undefined;
};
