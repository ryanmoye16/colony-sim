import { Scene } from 'phaser';
import { registerAllPixelSprites } from '../render/sprites';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    preload ()
    {
    }

    create ()
    {
        registerAllPixelSprites(this);
        this.scene.start('MainMenu');
    }
}
