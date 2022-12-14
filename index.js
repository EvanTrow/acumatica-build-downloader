const request = require('request');
const convert = require('xml-js');
const fs = require('fs-extra');
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

		var extractMsi = prompt(`${colors.cyan.bold('Extract MSI after download?')} (${colors.dim('Y/n')}) : `);
		if (!extractMsi) config.extractMsi = true;
		else config.extractMsi = extractMsi.toLocaleLowerCase() == 'y' ? true : false;

		if (config.extractMsi) {
			var location = prompt(`${colors.cyan.bold('Extract Location?')} (${colors.dim('C:\\acu')}) : `);
			if (!location) config.location = `C:\\acu`;
			else config.location = location;

			var lessmsi = prompt(`${colors.cyan.bold('Where is the lessmsi.exe installed?')} (${colors.dim('C:\\ProgramData\\chocolatey\\lib\\lessmsi\\tools\\lessmsi.exe')}) : `);
			if (!lessmsi) config.lessmsi = `C:\\ProgramData\\chocolatey\\lib\\lessmsi\\tools\\lessmsi.exe`;
			else config.lessmsi = lessmsi;
		}

		fs.writeFileSync('config.json', JSON.stringify(config));
	} else {
		config = JSON.parse(data);
	}

	start();
});

var builds = [];
var versions = [];

var xmlOptions = { compact: true, spaces: 4 };

async function start() {
	const requestedBuild = prompt(colors.cyan.bold('Acumatica Build Nbr: '));

	await WebRequest(`http://acumatica-builds.s3.amazonaws.com/?delimiter=/&prefix=builds/`)
		.then(async (body) => {
			await asyncForEach(convert.xml2js(body, xmlOptions).ListBucketResult.CommonPrefixes, async (folder, i) => {
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

				await WebRequest(`http://acumatica-builds.s3.amazonaws.com/?delimiter=/&prefix=builds/${version}/`)
					.then((body) => {
						convert.xml2js(body, xmlOptions).ListBucketResult.CommonPrefixes.forEach((build) => {
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
				top: '???',
				'top-mid': '???',
				'top-left': '???',
				'top-right': '???',
				bottom: '???',
				'bottom-mid': '???',
				'bottom-left': '???',
				'bottom-right': '???',
				left: '???',
				'left-mid': '???',
				mid: '???',
				'mid-mid': '???',
				right: '???',
				'right-mid': '???',
				middle: '???',
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

	if (config.extractMsi == true) {
		if (fs.existsSync(`${config.location}/${selectedBuild.build}`)) {
			const overwriteExisting = prompt(colors.yellow.bold(`Build is already loaded, OVERWRITE existing files in [ ${config.location}\\${selectedBuild.build} ] ?  (y/N) : `));
			if (overwriteExisting != 'y' && overwriteExisting != 'Y') {
				console.log('Opening destination folder...'.green);
				await openExplorer(`${config.location}\\${selectedBuild.build}`);
				process.exit(0);
			} else {
				console.log(`Deleting existing files in ${config.location}\\${selectedBuild.build}...`.yellow);
				fs.rmSync(`${config.location}/${selectedBuild.build}`, { recursive: true, force: true });
				console.log('Done.'.green);
			}
		}
	}

	downloadMSI(`http://acumatica-builds.s3.amazonaws.com/${selectedBuild.path}AcumaticaERP/AcumaticaERPInstall.msi`, async (err) => {
		if (err) throw err;

		console.log('Downloaded!'.green);

		if (config.extractMsi == true) {
			const progressBar = new cliProgress.SingleBar({
				format: colors.yellow('Extracting') + '  |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Files',
				barCompleteChar: '\u2588',
				barIncompleteChar: '\u2591',
				hideCursor: true,
			});
			var spawn = require('child_process').spawn,
				child;
			child = spawn(config.lessmsi, ['x', 'AcumaticaERPInstall.msi', config.location + '\\' + selectedBuild.build]);
			child.stdout.on('data', function (data) {
				try {
					if (progressBar.getProgress() <= 0) {
						var fileCount = data.toString().split('/')[1].match(/\d+/)[0];
						progressBar.start(parseInt(fileCount), 1);
					} else {
						var activeFile = data.toString().split('/')[0].match(/\d+/)[0];
						progressBar.update(parseInt(activeFile));
					}
				} catch (e) {
					//console.log(e);
				}
			});
			child.stderr.on('data', function (data) {
				console.log('Powershell Error: ' + data);
			});
			child.on('exit', async () => {
				progressBar.stop();
				console.log('Extracted!'.green);

				console.log('Moving Files...'.yellow);
				if (fs.existsSync(`AcumaticaERPInstall/SourceDir/Acumatica ERP`)) {
					// Do something

					fs.moveSync(`AcumaticaERPInstall/SourceDir/Acumatica ERP`, `${config.location}/${selectedBuild.build}`, (err) => {
						if (err) return console.error(err);
					});
				} else {
					fs.moveSync(`AcumaticaERPInstall/SourceDir`, `${config.location}/${selectedBuild.build}`, (err) => {
						if (err) return console.error(err);
					});
				}
				console.log('Moved.'.green);

				console.log('Removing temp files...'.yellow);
				fs.rmSync(`AcumaticaERPInstall`, { recursive: true, force: true });
				fs.rmSync(`AcumaticaERPInstall.msi`, { recursive: true, force: true });
				console.log('Done.'.green);

				console.log('COMPLETE!'.green);
				await openExplorer(`${config.location}\\${selectedBuild.build}`);
			});
			child.stdin.end(); //end input
		} else {
			fs.renameSync('AcumaticaERPInstall.msi', `AcumaticaERPInstall-${selectedBuild.build}.msi`);

			console.log(`COMPLETE! - AcumaticaERPInstall-${selectedBuild.build}.msi`.green);

			await openExplorer(__dirname);
		}
	});
}

async function downloadMSI(url, callback) {
	const progressBar = new cliProgress.SingleBar({
		format: colors.yellow('Downloading') + ' |' + colors.cyan('{bar}') + '| {percentage}% || {value}/{total} Chunks',
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

function WebRequest(url) {
	return new Promise(function (resolve, reject) {
		request(url, function (error, res, body) {
			if (!error && res.statusCode === 200) {
				resolve(body);
			} else {
				reject(error);
			}
		});
	});
}

async function asyncForEach(array, callback) {
	for (let index = 0; index < array.length; index++) {
		await callback(array[index], index, array);
	}
}

async function openExplorer(path) {
	const { spawn } = require('child_process');
	const child = spawn('explorer', [path]);

	let data = '';
	for await (const chunk of child.stdout) {
		//console.log('stdout chunk: '+chunk);
		data += chunk;
	}
	let error = '';
	for await (const chunk of child.stderr) {
		console.error('stderr chunk: ' + chunk);
		error += chunk;
	}
	await new Promise((resolve, reject) => {
		child.on('close', resolve);
	});

	return data;
}
