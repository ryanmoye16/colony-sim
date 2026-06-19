import { Scene } from 'phaser';
import { loadKenneyAssets, registerAllPixelSprites } from '../render/sprites';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    preload ()
    {
        loadKenneyAssets(this);
    }

    create ()
    {
        registerAllPixelSprites(this);
        this.scene.start('MainMenu');
    }
}
