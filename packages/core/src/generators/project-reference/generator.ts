import { readProjectConfiguration, Tree } from '@nx/devkit';

import { DotNetClient, dotnetFactory } from '@nx-dotnet/dotnet';
import { getProjectFileForNxProject } from '@nx-dotnet/utils';

import { NxDotnetGeneratorSchema } from './schema';

export default async function (
  host: Tree,
  options: NxDotnetGeneratorSchema,
  client = new DotNetClient(dotnetFactory()),
) {
  const hostProject = readProjectConfiguration(host, options.project);
  const sourceProject = readProjectConfiguration(host, options.reference);
  let [hostProjectFile, sourceProjectFile] = ['', ''];

  try {
    [hostProjectFile, sourceProjectFile] = await Promise.all([
      getProjectFileForNxProject(hostProject),
      getProjectFileForNxProject(sourceProject),
    ]);
  } catch {
    throw new Error('Unable to find project files to add dependency!');
  }

  client.addProjectReference(hostProjectFile, sourceProjectFile);
}
