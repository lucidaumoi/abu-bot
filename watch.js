import { spawn } from 'node:child_process';
import { watch } from 'node:fs';

const build = () => {
    const child = spawn('npm', ['run', 'build'], { stdio: 'inherit', shell: true });

    child.on('exit', code => {
        if (code === 0) {
            startBot();
        } else {
            console.error('Build failed. Bot not restarted.');
        }
    });
};

let botProcess = null;

const startBot = () => {
    if (botProcess) {
        botProcess.kill('SIGTERM');
    }

    botProcess = spawn(
        'node',
        ['--enable-source-maps', 'dist/start-bot.js'],
        {
            stdio: 'inherit',
            shell: true,
            env: {
                ...process.env,
            },
        }
    );

    botProcess.on('exit', code => {
        if (code !== 0) {
            console.error(`Bot exited with code ${code}`);
        }
    });
};

const watchedDirs = ['src', 'config', 'lang'];
for (const dir of watchedDirs) {
    watch(dir, { recursive: true }, () => {
        console.log(`Detected change in ${dir}, rebuilding...`);
        build();
    });
}

console.log('Watching src, config and lang for changes...');
build();
