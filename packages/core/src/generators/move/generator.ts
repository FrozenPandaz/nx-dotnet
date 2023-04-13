import {
  addProjectConfiguration,
  formatFiles,
  getWorkspaceLayout,
  joinPathFragments,
  names,
  normalizePath,
  ProjectConfiguration,
  readProjectConfiguration,
  removeProjectConfiguration,
  Tree,
  visitNotIgnoredFiles,
} from '@nx/devkit';
import { dirname, extname, relative } from 'path';
import { MoveGeneratorSchema } from './schema';

type NormalizedSchema = {
  currentRoot: string;
  destinationRoot: string;
  currentProject: string;
  destinationProject: string;
};

function normalizeOptions(
  tree: Tree,
  options: MoveGeneratorSchema,
): NormalizedSchema {
  const { appsDir, libsDir } = getWorkspaceLayout(tree);
  const currentRoot = readProjectConfiguration(tree, options.projectName).root;
  let destinationRoot = options.destination;
  if (!options.relativeToRoot) {
    if (currentRoot.startsWith(appsDir)) {
      destinationRoot = joinPathFragments(
        appsDir,
        options.destination.replace(new RegExp(`^${appsDir}`), ''),
      );
    } else if (currentRoot.startsWith(libsDir)) {
      destinationRoot = joinPathFragments(
        libsDir,
        options.destination.replace(new RegExp(`^${libsDir}`), ''),
      );
    }
  }

  return {
    currentRoot,
    destinationRoot,
    currentProject: options.projectName,
    destinationProject: names(options.destination).fileName.replace(
      /[\\|/]/g,
      '-',
    ),
  };
}

export default async function (tree: Tree, options: MoveGeneratorSchema) {
  const normalizedOptions = normalizeOptions(tree, options);
  const config = readProjectConfiguration(
    tree,
    normalizedOptions.currentProject,
  );
  config.root = normalizedOptions.destinationRoot;
  config.name = normalizedOptions.destinationProject;
  removeProjectConfiguration(tree, normalizedOptions.currentProject);
  renameDirectory(
    tree,
    normalizedOptions.currentRoot,
    normalizedOptions.destinationRoot,
  );
  addProjectConfiguration(
    tree,
    options.projectName,
    transformConfiguration(config, normalizedOptions),
  );
  updateXmlReferences(tree, normalizedOptions);
  await formatFiles(tree);
}

function transformConfiguration(
  config: ProjectConfiguration,
  options: NormalizedSchema,
) {
  return updateReferencesInObject(config, options);
}

function updateReferencesInObject<
  // eslint-disable-next-line @typescript-eslint/ban-types
  T extends Object | Array<unknown>,
>(object: T, options: NormalizedSchema): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newValue: any = Array.isArray(object)
    ? ([] as unknown as T)
    : ({} as T);
  for (const key in object) {
    if (typeof object[key] === 'string') {
      newValue[key] = (object[key] as string).replace(
        options.currentProject,
        options.destinationRoot,
      );
    } else if (typeof object[key] === 'object') {
      newValue[key] = updateReferencesInObject(object[key] as T, options);
    } else {
      newValue[key] = object[key];
    }
  }
  return newValue;
}

function updateXmlReferences(tree: Tree, options: NormalizedSchema) {
  visitNotIgnoredFiles(tree, '.', (path) => {
    const extension = extname(path);
    const directory = dirname(path);
    if (['.csproj', '.vbproj', '.fsproj', '.sln'].includes(extension)) {
      const contents = tree.read(path);
      if (!contents) {
        return;
      }
      const pathToUpdate = normalizePath(
        relative(directory, options.currentRoot),
      );
      const pathToUpdateWithWindowsSeparators = normalizePath(
        relative(directory, options.currentRoot),
      ).replaceAll('/', '\\');
      const newPath = normalizePath(
        relative(directory, options.destinationRoot),
      );

      console.log({ pathToUpdate, newPath });

      tree.write(
        path,
        contents
          .toString()
          .replaceAll(pathToUpdate, newPath)
          .replaceAll(pathToUpdateWithWindowsSeparators, newPath),
      );
    }
  });
}

function renameDirectory(tree: Tree, from: string, to: string) {
  const children = tree.children(from);
  for (const child of children) {
    const childFrom = joinPathFragments(from, child);
    const childTo = joinPathFragments(to, child);
    if (tree.isFile(childFrom)) {
      tree.rename(childFrom, childTo);
    } else {
      renameDirectory(tree, childFrom, childTo);
    }
  }
  if (!to.startsWith(from)) {
    tree.delete(from);
  }
}
