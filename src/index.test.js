import { fromHtml as hastUtilFromHtml } from 'hast-util-from-html'
import { test } from 'uvu'
import * as assert from 'uvu/assert'
import { hastUtilNoddity } from './index.js'

const urlRenderer = ({ file, id, nodes }) => ([ {
	type: 'element',
	tagName: 'a',
	properties: { href: `https://site.com/${file}${id ? `#${id}` : ''}` },
	children: nodes,
} ])

const templateRenderer = async ({ file, parameters }) => {
	return [
		{
			type: 'text',
			value: `[file=${file}${parameters?.length ? ',params=' : ''}${parameters.map(f => typeof f === 'string' ? f : `${f.key}=${f.value}`).join(';')}]`,
		},
	]
}

const htmlToHast = string => hastUtilFromHtml(string, { fragment: true })

const recurseClear = obj => {
	if (obj?.data?.quirksMode !== undefined && Object.keys(obj.data).length === 1) delete obj.data
	if (obj?.children?.length) obj.children.forEach(recurseClear)
	if (obj?.position) delete obj.position
}

test('init', () => {
	assert.equal(typeof hastUtilNoddity, 'function')
})

test('if no noddity links or templates are found the functions are never called', async () => {
	const hast = await hastUtilNoddity(htmlToHast('no noddity'), {
		urlRenderer: async () => { throw 'do not call' },
		templateRenderer: async () => { throw 'do not call' },
	})
	recurseClear(hast)
	assert.equal(hast, {
		type: 'root',
		children: [ { type: 'text', value: 'no noddity' } ],
	})
})

test('basic link parsing with text', async () => {
	const tree = await hastUtilNoddity(htmlToHast('Links [[file1.md|to things]] are neat'), { urlRenderer })
	recurseClear(tree)
	assert.equal(
		tree,
		{
			type: 'root',
			children: [
				{
					type: 'text',
					value: 'Links ',
				},
				{
					type: 'element',
					tagName: 'a',
					properties: {
						href: 'https://site.com/file1.md',
					},
					children: [
						{
							type: 'text',
							value: 'to things',
						},
					],
				},
				{
					type: 'text',
					value: ' are neat',
				},
			],
		},
	)
})

test('link parsing with hash fragments', async () => {
	const tree = await hastUtilNoddity(htmlToHast('Links [[file.md#heading|internal]] are neat'), { urlRenderer })
	recurseClear(tree)
	assert.equal(
		tree,
		{
			type: 'root',
			children: [
				{
					type: 'text',
					value: 'Links ',
				},
				{
					type: 'element',
					tagName: 'a',
					properties: {
						href: 'https://site.com/file.md#heading',
					},
					children: [
						{
							type: 'text',
							value: 'internal',
						},
					],
				},
				{
					type: 'text',
					value: ' are neat',
				},
			],
		},
	)
})

test('basic link parsing without text and asserting that you do not need to return a link', async () => {
	const tree = await hastUtilNoddity(
		htmlToHast('Links [[file.md]] are neat'),
		{
			urlRenderer: ({ file, id, nodes }) => {
				assert.equal(file, 'file.md')
				assert.equal(id, undefined)
				assert.equal(nodes, [])
				return [ {
					type: 'text',
					value: file,
				} ]
			},
		},
	)
	recurseClear(tree)
	assert.equal(
		tree,
		{
			type: 'root',
			children: [
				{
					type: 'text',
					value: 'Links file.md are neat',
				},
			],
		},
	)
})

test('link parsing where a square bracket is in the text part', async () => {
	const tree = await hastUtilNoddity(htmlToHast('Links [[file.md|has [some] note]] are neat'), { urlRenderer })
	recurseClear(tree)
	assert.equal(
		tree,
		{
			type: 'root',
			children: [
				{
					type: 'text',
					value: 'Links ',
				},
				{
					type: 'element',
					tagName: 'a',
					properties: {
						href: 'https://site.com/file.md',
					},
					children: [
						{
							type: 'text',
							value: 'has [some] note',
						},
					],
				},
				{
					type: 'text',
					value: ' are neat',
				},
			],
		},
	)
})

test('link parsing where a pipe is in the text part', async () => {
	const tree = await hastUtilNoddity(htmlToHast('Links [[file.md|has | pipe]] are neat'), { urlRenderer })
	recurseClear(tree)
	assert.equal(
		tree,
		{
			type: 'root',
			children: [
				{
					type: 'text',
					value: 'Links ',
				},
				{
					type: 'element',
					tagName: 'a',
					properties: {
						href: 'https://site.com/file.md',
					},
					children: [
						{
							type: 'text',
							value: 'has | pipe',
						},
					],
				},
				{
					type: 'text',
					value: ' are neat',
				},
			],
		},
	)
})

test('link with newline is not valid', async () => {
	const node = htmlToHast('Links [[file.md|has\na note]] are neat')
	const tree = await hastUtilNoddity(node, {})
	assert.ok(tree === node, 'same item by reference')
})

test('link that does not end is not valid', async () => {
	const node = htmlToHast('Links [[file.md|has')
	const tree = await hastUtilNoddity(node, {})
	assert.ok(tree === node, 'same item by reference')
})

test('link with another square bracket ending after means first one was link end', async () => {
	const tree = await hastUtilNoddity(htmlToHast('Links [[file.md|]]text]] are neat'), { urlRenderer })
	recurseClear(tree)
	assert.equal(
		tree,
		{
			type: 'root',
			children: [
				{
					type: 'text',
					value: 'Links ',
				},
				{
					type: 'element',
					tagName: 'a',
					properties: {
						href: 'https://site.com/file.md',
					},
					children: [],
				},
				{
					type: 'text',
					value: 'text]] are neat',
				},
			],
		},
	)
})

test('link parsing with a link split across nodes', async () => {
	const tree = await hastUtilNoddity(htmlToHast('links [[file.md|with <em>html</em> inside]] are possible'), { urlRenderer })
	recurseClear(tree)
	assert.equal(
		tree,
		{
			type: 'root',
			children: [
				{
					type: 'text',
					value: 'links ',
				},
				{
					type: 'element',
					tagName: 'a',
					properties: {
						href: 'https://site.com/file.md',
					},
					children: [
						{
							type: 'text',
							value: 'with ',
						},
						{
							type: 'element',
							tagName: 'em',
							properties: {},
							children: [
								{
									type: 'text',
									value: 'html',
								},
							],
						},
						{
							type: 'text',
							value: ' inside',
						},
					],
				},
				{
					type: 'text',
					value: ' are possible',
				},
			],
		},
	)
})

test('basic template parsing', async () => {
	const tree = await hastUtilNoddity(htmlToHast('templates ::file1.md:: are ::file2.md|cars|wheels=2:: neat'), {
		templateRenderer,
	})
	recurseClear(tree)
	assert.equal(
		tree,
		{
			type: 'root',
			children: [
				{
					type: 'text',
					value: 'templates [file=file1.md] are [file=file2.md,params=cars;wheels=2] neat',
				},
			],
		},
	)
})

test('newlines are not supported in templates', async () => {
	const tree = await hastUtilNoddity(htmlToHast('word1 ::file.md|\nthings:: word2'), {})
	recurseClear(tree)
	assert.equal(
		tree,
		{
			type: 'root',
			children: [
				{
					type: 'text',
					value: 'word1 ::file.md|\nthings:: word2',
				},
			],
		},
	)
})

test('end of string in text node means not a valid template', async () => {
	const tree = await hastUtilNoddity(htmlToHast('word1 ::file.md|'), {})
	recurseClear(tree)
	assert.equal(
		tree,
		{
			type: 'root',
			children: [
				{
					type: 'text',
					value: 'word1 ::file.md|',
				},
			],
		},
	)
})

test('double colons at end of line are not parsed as a template', async () => {
	const tree = await hastUtilNoddity(htmlToHast('at the end of a line ::\n'), {})
	recurseClear(tree)
	assert.equal(
		tree,
		{
			'type': 'root',
			'children': [
				{
					'type': 'text',
					'value': 'at the end of a line ::\n',
				},
			],
		},
	)
})

test('template parsing where variables portion contain semicolons that are not next to each other', async () => {
	const tree = await hastUtilNoddity(htmlToHast('Please read ::book-description.md|My Book: It Has Words:: on the webs.'), { templateRenderer })
	recurseClear(tree)
	assert.equal(
		tree,
		{
			type: 'root',
			children: [
				{
					type: 'text',
					value: 'Please read [file=book-description.md,params=My Book: It Has Words] on the webs.',
				},
			],
		},
	)
})

test('template parsing where multiple semicolons means end of template', async () => {
	const tree = await hastUtilNoddity(htmlToHast('Please read ::book-description.md|My Book:: It Has Words:: on the webs.'), { templateRenderer })
	recurseClear(tree)
	assert.equal(
		tree,
		{
			type: 'root',
			children: [
				{
					type: 'text',
					value: 'Please read [file=book-description.md,params=My Book] It Has Words:: on the webs.',
				},
			],
		},
	)
})

test('template parsing where a template is right after a template and no spaces', async () => {
	const tree = await hastUtilNoddity(htmlToHast('word1::file1.md|var1::::file2.md|var2::word2'), { templateRenderer })
	recurseClear(tree)
	assert.equal(
		tree,
		{
			type: 'root',
			children: [
				{
					type: 'text',
					value: 'word1[file=file1.md,params=var1][file=file2.md,params=var2]word2',
				},
			],
		},
	)
})

test('link with a template', async () => {
	const tree = await hastUtilNoddity(htmlToHast('word1 [[file.md|title ::big.md|with:: template]] word2'), {
		urlRenderer,
		templateRenderer: async ({ file, parameters }) => {
			assert.equal(file, 'big.md')
			assert.equal(parameters.length, 1)
			assert.equal(parameters[0], 'with')
			return [
				{
					type: 'text',
					value: 'internal ',
				},
				{
					type: 'element',
					tagName: 'em',
					children: [
						{
							type: 'text',
							value: 'links are',
						},
					],
				},
				{
					type: 'text',
					value: ' supported',
				},
			]
		},
	})
	recurseClear(tree)
	assert.equal(
		tree,
		{
			type: 'root',
			children: [
				{
					'type': 'text',
					'value': 'word1 ',
				},
				{
					'type': 'element',
					'tagName': 'a',
					'properties': {
						'href': 'https://site.com/file.md',
					},
					'children': [
						{
							'type': 'text',
							'value': 'title internal ',
						},
						{
							'type': 'element',
							'tagName': 'em',
							'children': [
								{
									'type': 'text',
									'value': 'links are',
								},
							],
						},
						{
							'type': 'text',
							'value': ' supported template',
						},
					],
				},
				{
					'type': 'text',
					'value': ' word2',
				},
			],
		},
	)
})

test.run()
