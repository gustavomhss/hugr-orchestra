import { buildLocationServiceMap, type LocationError } from "../location-services"
import { LocationServiceMap } from "../location-service-map"
import { LayerNode } from "./layer-node"
import { makeGlobalNode, type Node } from "./app-node"
import { Context, Deferred, Layer } from "effect"

/** `locationNodes` are appended to every Location map this root builds (Host.Contribution.locationNodes). */
export function build<A, E>(
  root: LayerNode.Node<A, E, any>,
  replacements: LayerNode.Replacements = [],
  locationNodes: ReadonlyArray<Node.LocationNode<unknown, LocationError>> = [],
) {
  return Layer.suspend(() => {
    const globalContext = Deferred.makeUnsafe<Context.Context<never>>()
    let allReplacements = replacements

    // Only build the location service map if it's actually needed
    if (LayerNode.hasUnbound(root, LocationServiceMap.node) && !hasReplacement(replacements, LocationServiceMap.node)) {
      const locationMap = buildLocationServiceMap(replacements, locationNodes)
      const locationMapNode = makeGlobalNode({ service: LocationServiceMap.Service, layer: locationMap, deps: [] })
      allReplacements = replacements.concat([[LocationServiceMap.node, locationMapNode]])
    }

    return LayerNode.compile(root, allReplacements, {
      // Bind after replacement resolution so concrete maps and explicit replacements
      // captured by constructors share the same completed application exports.
      transformLayer: (layer, node) =>
        node.name === LocationServiceMap.node.name
          ? LocationServiceMap.withGlobalContext(layer, Deferred.await(globalContext))
          : layer,
    }).pipe(
      // Startup forks may acquire Locations while the root is still building.
      Layer.tap((context) => Deferred.succeed(globalContext, context)),
    )
  })
}

function hasReplacement(replacements: LayerNode.Replacements, node: LayerNode.Node<unknown, unknown, any>) {
  return replacements.some(([source]) => source.name === node.name)
}

export * as AppNodeBuilder from "./app-node-builder"
