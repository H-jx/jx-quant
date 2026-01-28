use core::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PeriodUnit {
    Ms,
    S,
    M,
    H,
    D,
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct Period {
    ms: i64,
}

impl fmt::Debug for Period {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Period({}ms)", self.ms)
    }
}

impl Period {
    pub fn from_ms(ms: i64) -> Self {
        assert!(ms > 0);
        Self { ms }
    }

    pub fn as_ms(&self) -> i64 {
        self.ms
    }

    pub fn parse(s: &str) -> Result<Self, &'static str> {
        let s = s.trim();
        if s.is_empty() {
            return Err("empty period");
        }
        let mut digits_end = 0usize;
        for (i, ch) in s.char_indices() {
            if ch.is_ascii_digit() {
                digits_end = i + ch.len_utf8();
            } else {
                break;
            }
        }
        if digits_end == 0 {
            return Err("missing number");
        }
        let n: i64 = s[..digits_end].parse().map_err(|_| "invalid number")?;
        if n <= 0 {
            return Err("period must be > 0");
        }
        let unit = s[digits_end..].trim().to_ascii_lowercase();
        let ms = match unit.as_str() {
            "ms" => n,
            "s" => n * 1_000,
            "m" => n * 60_000,
            "h" => n * 3_600_000,
            "d" => n * 86_400_000,
            _ => return Err("unsupported unit (use ms/s/m/h/d)"),
        };
        Ok(Self::from_ms(ms))
    }

    #[inline]
    pub fn bucket_start(&self, ts_ms: i64) -> i64 {
        // Floor to boundary for positive timestamps (ms since epoch).
        (ts_ms / self.ms) * self.ms
    }
}

#[cfg(test)]
mod tests {
    use super::Period;

    #[test]
    fn parse_periods() {
        assert_eq!(Period::parse("15m").unwrap().as_ms(), 15 * 60_000);
        assert_eq!(Period::parse("4h").unwrap().as_ms(), 4 * 3_600_000);
        assert_eq!(Period::parse("1d").unwrap().as_ms(), 86_400_000);
        assert_eq!(Period::parse("500ms").unwrap().as_ms(), 500);
    }

    #[test]
    fn bucket_start() {
        let p = Period::parse("15m").unwrap();
        assert_eq!(p.bucket_start(0), 0);
        assert_eq!(p.bucket_start(1), 0);
        assert_eq!(p.bucket_start(15 * 60_000), 15 * 60_000);
        assert_eq!(p.bucket_start(15 * 60_000 + 1), 15 * 60_000);
    }
}

