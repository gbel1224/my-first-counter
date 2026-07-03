using UnityEngine;

namespace PalmCity
{
    /// The only component you need to add in the Editor.
    /// Put it on an empty GameObject in an empty scene and press Play —
    /// it wires up the whole game from code and primitives.
    public class PalmCityBootstrap : MonoBehaviour
    {
        [Header("Start Mode")]
        [Tooltip("Show the title screen (New Game / Continue / Free Roam) on launch.")]
        public bool showStartMenu = true;
        [Tooltip("If the start menu is off: skip the story, full arsenal + $5000.")]
        public bool freeRoam = false;
        [Tooltip("If the start menu is off: resume from the last save if one exists.")]
        public bool loadSaveIfPresent = true;

        void Awake()
        {
            Application.targetFrameRate = 60;
            gameObject.AddComponent<GameManager>();
            gameObject.AddComponent<CityGenerator>();
            gameObject.AddComponent<DayNightCycle>();
            gameObject.AddComponent<WantedSystem>();
            gameObject.AddComponent<EntityPopulator>();
            gameObject.AddComponent<MissionManager>();
        }

        void Start()
        {
            if (showStartMenu) StartMenu.Build(this);
            else Launch(freeRoam, loadSaveIfPresent);
        }

        public void Launch(bool asFreeRoam, bool load)
        {
            GameManager.Instance.Begin(asFreeRoam, load);
        }
    }
}
