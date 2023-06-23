const START = Symbol('[[')
const END = Symbol(']]')

const TAGS_TO_EXCLUDE = {
	code: true,
	pre: true,
}

const LINK_DELIMITERS = /(\[\[|]])/g
const NODDITY_TEMPLATE_REGEX = /::([^|\n]+?)(?:\|([^\n]+?))?::/gm
const LINK_INTERNALS = /([^#|\n]+)(?:#([^|\n]+))?(?:\|([^\n]+))?/

const mergeTextNodes = nodes => {
	const mergedNodes = []
	for (const node of nodes) {
		if (node.type === 'text' && mergedNodes[mergedNodes.length - 1]?.type === 'text') mergedNodes[mergedNodes.length - 1].value += node.value
		else mergedNodes.push(node)
	}
	return mergedNodes
}

const isValidNoddityLink = ({ start, end, nodes }) => start && end && nodes.length && nodes[0]?.type === 'text' && !nodes[0].value?.includes('\n')

const parseNoddityTemplate = async ({ node, matched, templateRenderer }) => {
	let previousOffset = 0
	const outputNodes = []
	for (const match of matched) {
		const [ text, file, metadata ] = match
		if (match.index > previousOffset) {
			outputNodes.push({
				type: 'text',
				value: node.value.slice(previousOffset, match.index),
			})
		}
		const parameters = []
		for (const string of (metadata?.split('|') || [])) {
			const equalIndex = string.indexOf('=')
			if (equalIndex > 0) parameters.push({ key: string.slice(0, equalIndex), value: string.slice(equalIndex + 1) })
			else parameters.push(string)
		}
		outputNodes.push(...(await templateRenderer({ file, parameters })))
		previousOffset = match.index + text.length
	}
	if (previousOffset < node.value.length) outputNodes.push({
		type: 'text',
		value: node.value.slice(previousOffset),
	})
	return outputNodes
}

const splitIntoPartials = nodes => {
	const partials = {}

	const match = LINK_INTERNALS.exec(nodes[0].value)
	if (match) {
		partials.file = match[1]
		partials.id = match[2]
	}

	partials.nodes = match[3]?.length
		? [ {
			type: 'text',
			value: match[3],
		} ]
		: []
	if (nodes.length > 1) partials.nodes.push(...nodes.slice(1))

	return partials
}

/*

Template *declarations* are not allowed to include Noddity links or HAST, but are allowed to
return HAST with Noddity links yet inside, so we process templates first to get a complete HAST
and then process links.

Unlike templates, it is possible that a link may span across nodes, for instance:

	<div>links [[file.md|with <em>html</em> inside]] are possible</div>

This will show up in a HAST something like this:

	[
		{ type: 'text', value: 'links [[file.md|with ' },
		{ type: 'element', tagName: 'em', children: [ { type: 'text', value: 'html' } ] },
		{ type: 'text', value: ' inside]] are possible' },
	]

The limitation here is that the link start and end characters must occur as text
nodes at the same depth, e.g. this is not valid Noddity syntax:

	<div>links [[file.md|with <em>split html]] are</em> not allowed</div>

This would produce a HAST something like this, which would not result in a parsed link:

	[
		{ type: 'text', value: 'links [[file.md|with ' },
		{ type: 'element', tagName: 'em', children: [ { type: 'text', value: 'split html]] are' } ] },
		{ type: 'text', value: ' not allowed' },
	]

It is possible that links occur across slightly more complex splits, e.g. this is allowed:

	<div>links [[file.md|with <em>html</em> inside]] are [[file2.md|possible <em>and</em>]] likely</div>

And this would produce a HAST something like this:

	[
		{ type: 'text', value: 'links [[file1.md|with ' },
		{ type: 'element', tagName: 'em', children: [ { type: 'text', value: 'html' } ] },
		{ type: 'text', value: ' inside]] are [[file2.md|possible ' },
		{ type: 'element', tagName: 'em', children: [ { type: 'text', value: 'and' } ] },
		{ type: 'text', value: ']] likely' },
	]

*/

const recursivelyProcess = async ({ node, tagsToExclude, urlRenderer, templateRenderer }) => {
	if (!tagsToExclude[node.tagName] && node.children?.length) {
		const templatedChildren = []
		for (const child of node.children) {
			const matched = child.type === 'text' && child.value?.length && [ ...child.value.matchAll(NODDITY_TEMPLATE_REGEX) ]
			if (matched?.length) templatedChildren.push(...(await parseNoddityTemplate({ node: child, matched, templateRenderer })))
			else templatedChildren.push(await recursivelyProcess({ node: child, tagsToExclude, urlRenderer, templateRenderer }))
		}

		// First we split across the link delimiters, e.g. `[[` and `]]`, but keep
		// the text information (in the form of symbols) so we can reconstruct
		// unmatched pairs later, e.g. `has [[incomplete link`
		const mixedNodes = []
		for (const child of mergeTextNodes(templatedChildren)) {
			if (child.type === 'text' && child.value) {
				let previousOffset = 0
				let match = LINK_DELIMITERS.exec(child.value)
				while (match) {
					if (match.index) {
						mixedNodes.push({
							type: 'text',
							value: child.value.slice(previousOffset, match.index),
						})
					}
					if (match[1] === '[[') mixedNodes.push(START)
					else if (match[1] === ']]') mixedNodes.push(END)
					previousOffset = match.index + match[0].length
					match = LINK_DELIMITERS.exec(child.value)
				}
				if (previousOffset < child.value.length) mixedNodes.push({
					type: 'text',
					value: child.value.slice(previousOffset),
				})
			} else mixedNodes.push(child)
		}

		// Here we are merging those into groupings of nodes that have a
		// start and end, to get the ones with both as distinct groups.
		const pairedMixedNodes = [ { nodes: [] } ]
		for (const mixed of mixedNodes) {
			if (mixed === START) {
				pairedMixedNodes.push({ start: true, nodes: [] })
			} else if (mixed === END) {
				pairedMixedNodes[pairedMixedNodes.length - 1].end = true
				pairedMixedNodes.push({ nodes: [] })
			} else {
				pairedMixedNodes[pairedMixedNodes.length - 1].nodes.push(mixed)
			}
		}

		// To be a complete Noddity link it needs a start and end, and it needs to have
		// a valid filename and delimiter, e.g. this would not be supported:
		//     bad [[file.md<em>foo</em>|link]] format
		const linkedNodes = []
		for (const { start, end, nodes } of pairedMixedNodes) {
			if (isValidNoddityLink({ start, end, nodes })) {
				linkedNodes.push(...(await urlRenderer(splitIntoPartials(nodes))))
			} else {
				if (start) linkedNodes.push({ type: 'text', value: '[[' })
				linkedNodes.push(...nodes)
				if (end) linkedNodes.push({ type: 'text', value: ']]' })
			}
		}

		node.children = mergeTextNodes(linkedNodes)
	}
	return node
}

/**
 * Extension to parse Noddity syntax from within an already-parsed hast.
 *
 * @param {Object} hastTree - The parsed hast tree.
 * @param {Object} exclude - Dictionary of elements to exclude when recursively entering HTML elements. Default: { pre: true, code: true }
 * @param {function({ file: string, id?: string, nodes: Array<Object> }): Promise<Array<Object>>} urlRenderer - Function called when rendering a Noddity link. The nodes are the child nodes of the hast element, if any. The output is a list of hast nodes.
 * @param {function({ file: string, parameters: Array<string|Object> }): Promise<Array<Object>>} templateRenderer - Function called when rendering a Noddity template. The parameters are an ordered list of Noddity parameters. The output is a list of hast nodes.
 * @return {Promise<Object>} - The mutated hast tree.
 */
export const hastUtilNoddity = async (hastTree, { exclude, urlRenderer, templateRenderer }) => {
	const tagsToExclude = Object.assign({}, TAGS_TO_EXCLUDE, exclude || {})
	return recursivelyProcess({ node: hastTree, tagsToExclude, urlRenderer, templateRenderer })
}
