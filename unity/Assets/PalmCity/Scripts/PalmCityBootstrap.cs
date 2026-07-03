using UnityEngine;

namespace PalmCity
{
    /// The only component you need to add in the Editor.
    /// Put it on an empty GameObject in an empty scene and press Play —
    /// it wires up the whole game from code and primitives.
    public class PalmCityBootstrap : MonoBehaviour
    {
        [Header("Start Mode")]
        [Tooltip("Skip the story and start with the full arsenal + $5000.")]
        public bool freeRoam = false;
        [Tooltip("Resume from the last save if one exists (story mode only).")]
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
            GameManager.Instance.Begin(freeRoam, loadSaveIfPresent);
        }
    }
}
