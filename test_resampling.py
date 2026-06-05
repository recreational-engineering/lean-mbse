import json
import tempfile
import unittest
from pathlib import Path

import app as app_module


class DeterministicRandom:
    values = [1.0, 3.0, 7.0, 9.0]

    def __init__(self):
        self._values = iter(type(self).values)

    def uniform(self, lower, upper):
        value = next(self._values)
        low, high = sorted((float(lower), float(upper)))
        if value < low or value > high:
            raise AssertionError(f"Deterministic sample {value} outside [{low}, {high}]")
        return value


class ResamplingApiTest(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        self.tmp_path = Path(self._tmpdir.name)

        self.original_requirements_path = app_module.REQUIREMENTS_PATH
        self.original_sample_table_path = app_module.SAMPLE_TABLE_PATH
        self.original_functions_path = app_module.FUNCTIONS_PATH
        self.original_random_class = app_module.random.Random

        app_module.REQUIREMENTS_PATH = self.tmp_path / "requirements.yaml"
        app_module.SAMPLE_TABLE_PATH = self.tmp_path / "sample_table.json"
        app_module.FUNCTIONS_PATH = self.tmp_path / "functions.py"
        app_module.random.Random = DeterministicRandom

        app_module.FUNCTIONS_PATH.write_text(
            "def add_offset(base: float, offset: float):\n"
            "    return base + offset\n",
            encoding="utf-8",
        )

        alpha = {
            "RQ1": {
                "name": "constraint_input",
                "solvable_bounds": [0, 0],
                "targeted_bounds": [None, None],
                "required_bounds": [0.0, 0.0],
                "expected_bounds": [0.0, 0.0],
                "driven_by": ["RQ2"],
                "relates_to": [],
                "unit": "",
                "status": "analysis",
                "definition": "",
                "value_source": "",
                "comments": [],
                "propagation_function": "",
                "propagation_inputs": {},
                "expected_bounds_from_function": False,
                "required_bounds_from_function": False,
                "constrained_bounds": [5.0, 5.0],
            },
            "RQ2": {
                "name": "top_output",
                "solvable_bounds": [0, 0],
                "targeted_bounds": [8.0, 12.0],
                "required_bounds": [0.0, 0.0],
                "expected_bounds": [0.0, 0.0],
                "driven_by": [],
                "relates_to": [],
                "unit": "",
                "status": "analysis",
                "definition": "",
                "value_source": "",
                "comments": [],
                "propagation_function": "add_offset",
                "propagation_inputs": {
                    "base": {
                        "lower_input": "RQ1",
                        "upper_input": "RQ1",
                        "invert_bounds": False,
                    },
                    "offset": {
                        "lower_input": "0",
                        "upper_input": "10",
                        "invert_bounds": False,
                    },
                },
                "expected_bounds_from_function": False,
                "required_bounds_from_function": False,
            },
        }
        app_module.save_requirements(alpha, {}, {})
        app_module.app.config["TESTING"] = True
        self.client = app_module.app.test_client()

    def tearDown(self):
        app_module.REQUIREMENTS_PATH = self.original_requirements_path
        app_module.SAMPLE_TABLE_PATH = self.original_sample_table_path
        app_module.FUNCTIONS_PATH = self.original_functions_path
        app_module.random.Random = self.original_random_class
        self._tmpdir.cleanup()

    def test_resample_persists_sample_table_and_updates_solvable_bounds(self):
        response = self.client.post("/api/samples/resample", json={"sample_count": 4})
        self.assertEqual(response.status_code, 200, response.get_json())
        payload = response.get_json()

        self.assertEqual(payload["sample_summary"]["pass_count"], 2)
        self.assertEqual(payload["sample_summary"]["fail_count"], 2)
        self.assertFalse(payload["sample_summary"]["zero_pass"])

        rows = payload["sample_table"]["rows"]
        self.assertEqual([row["sample_no"] for row in rows], [1, 2, 3, 4])
        self.assertEqual([row["RQ1"] for row in rows], [5.0, 5.0, 5.0, 5.0])
        self.assertEqual([row["RQ2"] for row in rows], [6.0, 8.0, 12.0, 14.0])
        self.assertEqual([row["pass"] for row in rows], [False, True, True, False])

        requirements_payload = self.client.get("/api/requirements").get_json()
        self.assertEqual(requirements_payload["by_id"]["RQ1"]["solvable_bounds"], [5.0, 5.0])
        self.assertEqual(requirements_payload["by_id"]["RQ2"]["solvable_bounds"], [8.0, 12.0])
        rq1_distribution = requirements_payload["by_id"]["RQ1"]["solvable_distribution"]
        self.assertEqual(rq1_distribution["sample_count"], 2)
        self.assertEqual(rq1_distribution["min"], 5.0)
        self.assertEqual(rq1_distribution["max"], 5.0)
        self.assertEqual(rq1_distribution["mean"], 5.0)
        self.assertEqual(rq1_distribution["std_dev"], 0.0)
        self.assertEqual(rq1_distribution["one_sigma_min"], 5.0)
        self.assertEqual(rq1_distribution["one_sigma_max"], 5.0)
        self.assertEqual(rq1_distribution["bins"], [{"x0": 5.0, "x1": 5.0, "count": 2}])

        rq2_distribution = requirements_payload["by_id"]["RQ2"]["solvable_distribution"]
        self.assertEqual(rq2_distribution["sample_count"], 2)
        self.assertEqual(rq2_distribution["min"], 8.0)
        self.assertEqual(rq2_distribution["max"], 12.0)
        self.assertEqual(rq2_distribution["mean"], 10.0)
        self.assertEqual(rq2_distribution["std_dev"], 2.0)
        self.assertEqual(rq2_distribution["one_sigma_min"], 8.0)
        self.assertEqual(rq2_distribution["one_sigma_max"], 12.0)
        self.assertEqual(
            rq2_distribution["bins"],
            [
                {"x0": 8.0, "x1": 10.0, "count": 1},
                {"x0": 10.0, "x1": 12.0, "count": 1},
            ],
        )

        sample_table_payload = self.client.get("/api/samples/table").get_json()
        self.assertEqual(sample_table_payload["rows"], rows)
        self.assertEqual(sample_table_payload["summary"], payload["sample_summary"])

        persisted_payload = json.loads(app_module.SAMPLE_TABLE_PATH.read_text(encoding="utf-8"))
        self.assertEqual(persisted_payload["rows"], rows)


if __name__ == "__main__":
    unittest.main()
