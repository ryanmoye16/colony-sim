import { Scene, GameObjects } from 'phaser';

export class MainMenu extends Scene
{
    background: GameObjects.Rectangle;
    title: GameObjects.Text;
    prompt: GameObjects.Text;

    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        this.background = this.add.rectangle(512, 384, 1024, 768, 0x1a1a2a);

        this.title = this.add.text(512, 340, 'Colony Sim', {
            fontFamily: 'Courier New',
            fontSize: 56,
            color: '#f0d090',
            stroke: '#000000',
            strokeThickness: 8,
            align: 'center',
        }).setOrigin(0.5);

        this.prompt = this.add.text(512, 440, 'Click anywhere to begin', {
            fontFamily: 'Courier New',
            fontSize: 20,
            color: '#a0a0a0',
            align: 'center',
        }).setOrigin(0.5);

        this.tweens.add({
            targets: this.prompt,
            alpha: 0.2,
            duration: 800,
            yoyo: true,
            repeat: -1,
        });

        this.input.once('pointerdown', () => {
            this.scene.start('World');
        });

        // Dev / debug: ?skipMenu in URL launches the world immediately so
        // headless tooling can screenshot the game without simulating a click.
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('skipMenu'))
        {
            this.scene.start('World');
        }
    }
}
