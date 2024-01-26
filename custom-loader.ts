import type { Stats } from 'node:fs'
import { promises as fs } from 'node:fs'
import type { CustomIconLoader, IconifyJSON } from '@iconify/utils/lib/loader/types'
import fg from 'fast-glob'
import { importModule, resolveModule } from 'local-pkg'
import { searchForIcon } from '@iconify/utils'

export function CustomScopedPackage(scope: string) {
  // collect scoped package collections:
  // rn using a relative path here, we should use resolveModule to resolve the package folder
  const cwd = `./node_modules/${scope}`
  const collections = fg.globSync(['*'], {
    onlyDirectories: true,
    deep: 1,
    cwd,
  })
  // eslint-disable-next-line no-console
  console.log(`${scope} collections: `, collections)
  // use spread operator in the unplugin-icons' customCollections option
  const customCollections: Record<string, CustomIconLoader> = {}
  // for each collection, create a custom icon loader
  for (const collection of collections)
    customCollections[collection] = createCustomIconLoader(scope, collection)

  return customCollections
}

const _collections: Record<string, Promise<IconifyJSON | undefined>> = {}

// copy/paste from packages/utils/src/loader/fs.ts without auto-install (can be added)
async function loadCollectionFromFS(
  name: string,
  scope = '@iconify-json',
): Promise<IconifyJSON | undefined> {
  if (!(await _collections[name]))
    _collections[name] = task()

  return _collections[name]

  async function task() {
    const packageName = `${scope}/${name}`
    const jsonPath = resolveModule(`${packageName}/icons.json`)

    // Try to import module if it exists
    if (!jsonPath) {
      let packagePath = resolveModule(packageName)
      if (packagePath?.match(/^[a-z]:/i))
        packagePath = `file:///${packagePath}`.replace(/\\/g, '/')

      if (packagePath) {
        const { icons }: { icons?: IconifyJSON } = await importModule(
          packagePath,
        )
        if (icons)
          return icons
      }
    }

    // Load from file
    let stat: Stats | undefined
    try {
      stat = jsonPath ? await fs.lstat(jsonPath) : undefined
    }
    catch (err) {
      return undefined
    }
    if (stat?.isFile()) {
      return JSON.parse(
        await fs.readFile(jsonPath as string, 'utf8'),
      ) as IconifyJSON
    }
    else {
      return undefined
    }
  }
}

function createCustomIconLoader(scope: string, collection: string) {
  // create the custom collection loader
  const iconSetPromise = loadCollectionFromFS(collection, scope)
  return <CustomIconLoader>(async (icon) => {
    // await until the collection is loaded
    const iconSet = await iconSetPromise
    // copy/paste from packages/utils/src/loader/node-loader.ts
    let result: string | undefined
    if (iconSet) {
      // possible icon names
      const ids = [
        icon,
        icon.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase(),
        icon.replace(/([a-z])(\d+)/g, '$1-$2'),
      ]
      result = await searchForIcon(iconSet, collection, ids)
    }

    return result
  })
}
