use tally_rounding::to_cents;

/// A running total, held in whole cents.
#[derive(Default)]
pub struct Ledger {
    cents: i64,
}

impl Ledger {
    pub fn record(&mut self, amount: f64) {
        self.cents += to_cents(amount);
    }

    pub fn total(&self) -> f64 {
        self.cents as f64 / 100.0
    }
}
