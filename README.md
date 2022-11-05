# hast-util-noddity

[Micromark](https://github.com/micromark/micromark) and [hast](https://github.com/syntax-tree/hast) extension to parse [noddity](http://noddity.com/) syntax from within HTML.

**Note:** if you're looking for a more complete library, have a look at [noddity-micromark-renderer](https://github.com/saibotsivad/noddity-micromark-renderer). This package does not resolve Noddity links or anything like that, it just parses text in the HTML to a tree. If you don't need to support Noddity syntax from in HTML, look at [mdast-util-noddity](https://github.com/saibotsivad/mdast-util-noddity/) instead.

## Install

This package is ESM only.

Install the usual ways:

```bash
npm install hast-util-noddity
```

## Use

Suppose we have some Noddity syntax that looks like this:

```html
<p>links [[file1.md#header1|with <em>html</em> inside]] are ::file2.md|allowed=yes::</p>
```

The [hast](https://github.com/syntax-tree/hast) would look something like this:

```js
const hast = {
	type: 'element',
	tagName: 'p',
	children: [
		{
			type: 'text',
			value: 'links [[file1.md#header1|with ',
		},
		{
			type: 'element',
			tagName: 'em',
			children: [
				{
					type: 'text',
					value: 'html',
				},
			],
		},
		{
			type: 'text',
			value: ' inside]] are ::file2.md|allowed=yes::',
		},
	]
}
```

Now if we use this library, we can do something like this:

```js
import { hastUtilNoddity } from 'hast-util-noddity'

const hastWithNoddity = await hastUtilNoddity(hast, {
	urlRenderer: async ({ file, id, nodes }) => {
		// return a list of hast nodes
		return [
			{
				type: 'element',
				tagName: 'a',
				properties: { href: `https://site.com/${file}${id ? `#${id}` : ''}` },
				children: nodes,
			}
		]
	},
	templateRenderer: async ({ file, parameters }) => {
		// grab the `file` template and render it using the
		// parameters, then return a list of hast nodes
		return [
			{
				type: 'element',
				tagName: 'strong',
				children: [
					{
						type: 'text',
						value: parameters
					}
				]
			}
		]
	}
})

console.log(hastWithNoddity)
```

…now running this yields (positional info removed for brevity):

<p>links [[file1.md#header1|with <em>html</em> inside]] are possible</p>

```json
{
	"type": "element",
	"tagName": "p",
	"children": [
		{
			"type": "text",
			"value": "links "
		},
		{
			"type": "element",
			"tagName": "a",
			"properties": { "href": "https://site.com/file1.md#header1" },
			"children": [
				{
					"type": "text",
					"value": "with"
				},
				{
					"type": "element",
					"tagName": "em",
					"children": [
						{
							"type": "text",
							"value": "html"
						}
					]
				},
				{
					"type": "text",
					"value": "inside"
				}
			]
		},
		{
			"type": "text",
			"value": " are "
		},
		{
			"type": "element",
			"tagName": "strong",
			"children": [
				{
					"type": "text",
					"value": "allowed=yes"
				}
			]
		}
	]
}
```

Bring your own template renderer, or check out [noddity-micromark-renderer](https://github.com/saibotsivad/noddity-micromark-renderer) for a version that handles recursive templates.

## License

Published and released under the [Very Open License](http://veryopenlicense.com).

If you need a commercial license, [contact me here](https://davistobias.com/license?software=hast-util-noddity).
