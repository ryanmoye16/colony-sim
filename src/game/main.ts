import { Boot } from './scenes/Boot';
import { MainMenu } from './scenes/MainMenu';
import { World } from './scenes/World';
import { PauseMenu } from './scenes/PauseMenu';
import { AUTO, Game } from 'phaser';
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
    scene: [
        Boot,
        Preloader,
        MainMenu,
        World,
        PauseMenu,
    ]
};

const StartGame = (parent: string) => {

    return new Game({ ...config, parent });

}

export default StartGame;
