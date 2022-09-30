import { validationSleep } from "../commands/runDraftTool/model/multiStep";

export async function validatePort(port: string) {
    await validationSleep();

    const portNum = parseInt(port);
    const portMin = 1;
    const portMax = 65535;
    const portErr = `Port must be in range ${portMin} to ${portMax}`;

    if (Number.isNaN(portNum)) {return portErr;}
    if (portNum < portMin) {return portErr;}
    if (portNum > portMax) {return portErr;};

    return undefined;
}