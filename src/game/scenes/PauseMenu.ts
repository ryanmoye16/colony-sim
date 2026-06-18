import { Scene } from 'phaser';

export class PauseMenu extends Scene
{
    constructor ()
    {
        super('PauseMenu');
    }

    create ()
    {
        this.add.rectangle(512, 384, 1024, 768, 0x000000, 0.6);

        this.add.text(512, 384, 'Paused\nClick to resume', {
            fontFamily: 'Arial Black',
            fontSize: 38,
            color: '#ffffff',
            align: 'center',
        }).setOrigin(0.5);

        this.input.once('pointerdown', () => {
            this.scene.resume('World');
            this.scene.stop();
        });

        this.input.keyboard?.on('keydown-ESC', () => {
            this.scene.resume('World');
            this.scene.stop();
        });
    }
}
