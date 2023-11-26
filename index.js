const Promise = require('bluebird');
const path = require('path');
const { parseStringPromise } = require('xml2js');
const { fs, util } = require('vortex-api');

// Platform specific IDs used by Hacknet.
const NEXUS_ID = 'hacknet';
const STEAM_ID = '365450';
const GOG_ID = '1439474400';

// Main executable for Hacknet Pathfinder. Required to use Pathfinder mods.
const PF_EXE = 'HacknetPathfinder.exe';
let PF_EXE_LOCATION = String.raw`C:\Program Files (x86)\Steam\steamapps\common\Hacknet\HacknetPathfinder.exe`;

// Manifest file required by Hacknet Extensions.
const EXT_FILE = 'extensioninfo.xml';

// File extension used to identify Pathfinder Mods.
const PF_FILE = '.dll'; 

// Include common tools used in Hacknet modding for convenience. Pathfinder should be run by default if present.
const tools = [
	{
		id: 'PF',
		name: 'Hacknet Pathfinder',
		shortName: 'Pathfinder',
		logo: 'pf.png',
		executable: () => 'HacknetPathfinder.exe',
		requiredFiles: [
			'HacknetPathfinder.exe',
		],
		relative: true,
		defaultPrimary: true
	},
	{
		id: 'HTE',
		name: 'Hacknet Themes Editor',
		logo: 'hte.png',
		executable: () => 'Hacknet Themes Editor.exe',
		requiredFiles: [
			'Hacknet Themes Editor.exe',
		],
	}
];

function findGame() {
	return util.GameStoreHelper.findByAppId([STEAM_ID, GOG_ID])
		.then(game => game.gamePath);
}

function prepareForModding(discovery) {
	PF_EXE_LOCATION = path.join(discovery.path, PF_EXE);
}

function testHacknetMod(files, gameId) {
	if (gameId === NEXUS_ID) {
		const validExtension = !!files.find(file => path.basename(file).toLowerCase() === EXT_FILE);
		const validPathfinderMod = !!files.find(file => path.extname(file).toLowerCase() === PF_FILE);

		return Promise.resolve({ supported: (validExtension || validPathfinderMod), requiredFiles: [] });
	} else return Promise.resolve({ supported: false, requiredFiles: [] });
}

function installHacknetMod(files, destinationPath, api) {
	return installExtension(files, destinationPath)
		.catch(() => installPathfinderMod(files, api)
			.catch(() => Promise.reject(new util.DataInvalid('Unrecognised or invalid Hacknet mod')))
		);
}

// Extensions need to be in seperate folders, so the name specified in ExtensionInfo.xml is used.
function getExtensionName(destination, modFile) {
	return fs.readFileAsync(path.join(destination, modFile))
		.then(async xmlData => {
			let extName;
			try {
				extName = (await parseStringPromise(xmlData))?.HacknetExtension?.Name?.[0];
				extName = extName.replace(/[\/:*?"<>|]/g, '');
				if (extName === '') {
					return Promise.reject(new util.DataInvalid('Name missing in ExtensionInfo.xml'));
				} else return Promise.resolve(extName);
			} catch {
				return Promise.reject(new util.DataInvalid('Failed to parse ExtensionInfo.xml'));
			}
		});
}

function installExtension(files, destinationPath) {
	const modFile = files.find(file => path.basename(file).toLowerCase() === EXT_FILE);
	if (!modFile) return Promise.reject('Not a valid Hacknet extension');
	const idx = modFile.indexOf(path.basename(modFile));
	const rootPath = path.dirname(modFile);
	
	return getExtensionName(destinationPath, modFile)
		.then(extName => {

			const filtered = files.filter(file => 
				((file.indexOf(rootPath) !== -1) 
				&& (!file.endsWith(path.sep))));
		
			const instructions = filtered.map(file => {
				return {
					type: 'copy',
					source: file,
					destination: path.join('Extensions', extName, file.substr(idx)),
				};
			});

			return Promise.resolve({ instructions });
		});
}

// Note: Will install any archive containing a DLL as a Pathfinder mod. Hopefully won't cause issues with additional DLLs.
function installPathfinderMod(files, api) {
	fs.statAsync(PF_EXE_LOCATION)
		.catch(() => {
			warnPathfinder(api);
		}
	);
	const modFile = files.find(file => path.extname(file).toLowerCase() === PF_FILE);
	if (!modFile) return Promise.reject('Not a valid Pathfinder mod');
	const idx = modFile.indexOf(path.basename(modFile));
	const rootPath = path.dirname(modFile);
	
	const filtered = files.filter(file => 
		((file.indexOf(rootPath) !== -1) 
		&& (!file.endsWith(path.sep))));

	const instructions = filtered.map(file => {
		return {
			type: 'copy',
			source: file,
			destination: path.join('Mods', file.substr(idx)),
		};
	});

	return Promise.resolve({ instructions });
}

function warnPathfinder(api) {
	api.sendNotification({
		id: 'pathfinder-missing',
		type: 'warning',
		title: 'Pathfinder not installed',
		message: 'Hacknet Pathfinder is required to use Pathfinder mods',
		actions: [
			{
				title: 'Get Pathfinder',
				action: () => util.opn('https://www.nexusmods.com/hacknet/mods/1').catch(() => undefined)
			}
		]
	});
}

function main(context) {
	context.registerGame({
		id: NEXUS_ID,
		name: 'Hacknet',
		mergeMods: true,
		requiresCleanup: true,
		queryPath: findGame,
		supportedTools: tools,
		queryModPath: () => '',
		logo: 'gameart.jpg',
		executable: () => 'Hacknet.exe',
		requiredFiles: [
			'Hacknet.bmp'
		],
		setup: prepareForModding,
		environment: {
			SteamAPPId: STEAM_ID,
		},
		details: {
			steamAppId: parseInt(STEAM_ID),
			gogAppId: GOG_ID,
		},
	});
	context.registerInstaller('hacknet-mod-installer', 25, testHacknetMod, (files, destinationPath) => installHacknetMod(files, destinationPath, context.api));
	return true;
}

module.exports = {
	default: main,
};
