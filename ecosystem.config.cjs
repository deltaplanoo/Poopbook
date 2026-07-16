module.exports = {
	apps: [
		{
			name: 'poopbook',
			script: './node_modules/vite/bin/vite.js',
			args: 'preview --host 127.0.0.1 --port 4174',
			cwd: '/home/delta/Builds/Poopbook'
		},
		{
			name: 'poopbook-pb',
			script: './pocketbase/pocketbase',
			args: 'serve --http=127.0.0.1:8090',
			cwd: '/home/delta/Builds/Poopbook',
			interpreter: 'none'
		}
	]
};
