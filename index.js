const axios = require('axios');
const request = require('request');
var convert = require('xml-js');
const fs = require('fs');
const path = require('path');
const naturalSort = require('javascript-natural-sort');
const stringSimilarity = require('string-similarity');
const prompt = require('prompt-sync')({ sigint: true });
const colors = require('colors');
const Table = require('cli-table');
const cliProgress = require('cli-progress');

var config = {};

fs.readFile('config.json', (err, data) => {
	if (err) {
		console.log(colors.red('Config not found. ') + 'Running setup...');
		var location = prompt(colors.cyan.bold('Extract Location: '));
		config.location = location;
		fs.writeFileSync('config.json', JSON.stringify(config));
	} else {
		config = JSON.parse(data);
	}

	start(config);
});

var builds = [];
var versions = [];

var xmlOptions = { compact: true, spaces: 4 };

async function start(config) {
	const requestedBuild = prompt(colors.cyan.bold('Acumatica Build Nbr: '));

	await axios
		.get(`http://acumatica-builds.s3.amazonaws.com/?delimiter=/&prefix=builds/`)
		.then(async (res) => {
			await asyncForEach(convert.xml2js(res.data, xmlOptions).ListBucketResult.CommonPrefixes, async (folder, i) => {
				if (/^(\d*\.)\d.*$/.test(folder.Prefix._text.replace('builds/', '').replace('/', ''))) {
					var version = folder.Prefix._text.replace('builds/', '').replace('/', '');

					versions.push(version);
				}
			});

			// sort versions
			versions = versions.sort(function (a, b) {
				return parseFloat(b) - parseFloat(a);
			});

			await asyncForEach(versions, async (version, i) => {
				var verionBuilds = [];
				var verionBuildz = [];

				await axios
					.get(`http://acumatica-builds.s3.amazonaws.com/?delimiter=/&prefix=builds/${version}/`)
					.then((res) => {
						convert.xml2js(res.data, xmlOptions).ListBucketResult.CommonPrefixes.forEach((build) => {
							if (/^\d{1,}\.\d{1,}\.\d{1,}/.test(build.Prefix._text.replace('builds/', '').replace('/', ''))) {
								verionBuilds.push({
									version: version,
									build: build.Prefix._text.replace(`builds/${version}/`, '').replace('/', ''),
									path: build.Prefix._text,
								});
								verionBuildz.push(build.Prefix._text.replace(`builds/${version}/`, '').replace('/', ''));
							}
						});
					})
					.catch((err) => console.error(err));

				verionBuildz = verionBuildz.sort(naturalSort).reverse();

				verionBuildz.forEach((build) => {
					builds.push(verionBuilds.filter((b) => b.build == build)[0]);
				});
			});
		})
		.catch((err) => console.error(err));

	let buildsJson = JSON.stringify(builds);
	fs.writeFileSync('acu-builds.json', buildsJson);

	var selectedBuild = builds.find((b) => b.build == requestedBuild);

	if (!selectedBuild) {
		const matches = stringSimilarity.findBestMatch(
			requestedBuild.toString(),
			builds.map((b) => b.build)
		);

		const bestMatches = matches.ratings
			.sort(function (a, b) {
				return b.rating - a.rating;
			})
			.slice(0, 10);

		console.log('Build not found!');

		var table = new Table({
			chars: {
				top: '═',
				'top-mid': '╤',
				'top-left': '╔',
				'top-right': '╗',
				bottom: '═',
				'bottom-mid': '╧',
				'bottom-left': '╚',
				'bottom-right': '╝',
				left: '║',
				'left-mid': '╟',
				mid: '─',
				'mid-mid': '┼',
				right: '║',
				'right-mid': '╢',
				middle: '│',
			},
			head: ['index', 'Build', 'Match'],
		});
		bestMatches.forEach((match, i) => {
			table.push([`${i}`.cyan, `${match.target}`, `${(match.rating * 100).toFixed(1)}%`.green]);
		});
		console.log(table.toString());

		const altBuild = prompt(colors.cyan(`Select a simular build index: `));

		var selectedBuild = builds.find((b) => b.build == bestMatches[altBuild].target);
	}

	console.log(colors.green.bold(`Selected build: `), selectedBuild);

	downloadMSI(`http://acumatica-builds.s3.amazonaws.com/${selectedBuild.path}AcumaticaERP/AcumaticaERPInstall.msi`, (err) => {
		if (err) throw err;

		console.log('Donwload Complete!'.green);

		// console.log(`Powershell -ExecutionPolicy Bypass -Command "& '${__dirname}\\ExtractAcumatica.ps1' ${config.location} ${__dirname}\\AcumaticaERPInstall.msi ${__dirname}`);

		// var exec = require('child_process').exec,
		// 	child;
		// child = exec(
		// 	`Powershell -ExecutionPolicy Bypass -Command "& '${__dirname}\\ExtractAcumatica.ps1' ${config.location} ${__dirname}\\AcumaticaERPInstall.msi ${__dirname}`,
		// 	function (error, stdout, stderr) {
		// 		console.log('stdout: ' + stdout);
		// 	}
		// );
	});
}

async function downloadMSI(url, callback) {
	const progressBar = new cliProgress.SingleBar({
		format: 'Downloading |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Chunks',
		barCompleteChar: '\u2588',
		barIncompleteChar: '\u2591',
		hideCursor: true,
	});

	const file = fs.createWriteStream('AcumaticaERPInstall.msi');
	let receivedBytes = 0;

	request
		.get(url)
		.on('response', (response) => {
			if (response.statusCode !== 200) {
				return callback('Response status was ' + response.statusCode);
			}

			const totalBytes = response.headers['content-length'];
			progressBar.start(totalBytes, 0);
		})
		.on('data', (chunk) => {
			receivedBytes += chunk.length;
			progressBar.update(receivedBytes);
		})
		.pipe(file)
		.on('error', (err) => {
			fs.unlink(filename);
			progressBar.stop();
			return callback(err.message);
		});

	file.on('finish', () => {
		progressBar.stop();
		file.close(callback);
	});

	file.on('error', (err) => {
		fs.unlink(filename);
		progressBar.stop();
		return callback(err.message);
	});
}

async function asyncForEach(array, callback) {
	for (let index = 0; index < array.length; index++) {
		await callback(array[index], index, array);
	}
}
