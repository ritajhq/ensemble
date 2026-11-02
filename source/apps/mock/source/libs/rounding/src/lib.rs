/// Rounds an amount to the nearest whole cent.
pub fn to_cents(amount: f64) -> i64 {
    (amount * 100.0).round() as i64
}

#[cfg(test)]
mod tests {
    use super::to_cents;

    #[test]
    fn rounds_to_the_nearest_cent() {
        assert_eq!(to_cents(1.005_1), 101);
    }
}
