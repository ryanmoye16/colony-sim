import { Boot } from './scenes/Boot';
import { MainMenu } from './scenes/MainMenu';
import { World } from './scenes/World';
import { PauseMenu } from './scenes/PauseMenu';
import { AUTO, CANVAS, Game } from 'phaser';
import { Preloader } from './scenes/Preloader';

const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 1024,
    height: 768,
    parent: 'game-container',
    backgroundColor: '#000000',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    // Canvas2D mode is enabled by `?canvas=1` in the URL. Useful for
    // headless tooling (Page.captureScreenshot, canvas.toDataURL) which
    // can't reliably capture WebGL canvases in headless Chrome.
    ...(typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('canvas')
        ? { type: CANVAS as unknown as typeof AUTO }
        : {}),
    scene: [
        Boot,
        Preloader,
        MainMenu,
        World,
        PauseMenu,
    ]
};

const StartGame = (parent: string) => {

    const game = new Game({ ...config, parent });
    // Dev hook: expose the game so headless tooling can drive the camera.
    if (typeof window !== 'undefined') (window as unknown as { __GAME: Game }).__GAME = game;
    return game;

}

export default StartGame;
